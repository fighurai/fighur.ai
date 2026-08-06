"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ConnectStatusResponse } from "@/lib/connect-status-types";
import { readSession } from "@/lib/auth-storage";
import {
  readConnectedServices,
  writeConnectedServices,
  type ConnectedServicesState,
} from "@/lib/connected-services";
import { PrivacyWaiverModal } from "@/components/privacy-waiver-modal";
import {
  connectDeviceFolder,
  idbClearDeviceHandle,
  supportsDeviceFolderPicker,
} from "@/lib/device-files-client";
import {
  hasAcceptedPrivacyWaiver,
  recordPrivacyWaiverAcceptance,
  type PrivacyWaiverKind,
} from "@/lib/privacy-waiver";
import { saveWorkModeToServer, syncConnectedServicesFromServer } from "@/lib/connected-services-sync";
import { WORK_MODE_OPTIONS, workModeLabel, type WorkMode } from "@/lib/work-mode";

type SettingsTab = "agent" | "skills" | "connectors" | "apps" | "mcp";

type SkillRow = {
  name: string;
  description: string;
  source: "builtin" | "custom";
  enabled: boolean;
};

type AppRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  slug: string;
  fileCount: number;
  updatedAt: string;
};

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "agent", label: "Customize" },
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "apps", label: "Apps" },
  { id: "mcp", label: "MCP" },
];

async function fetchConnectStatus(): Promise<ConnectStatusResponse> {
  const res = await fetch("/api/connect/status", { cache: "no-store" });
  return (await res.json()) as ConnectStatusResponse;
}

const OAUTH_ERROR_HINTS: Record<string, string> = {
  storage_failed: "Could not save the connection. Try again after signing in.",
  invalid_callback: "OAuth state expired. Open Settings and click Connect again.",
  bad_state: "OAuth state mismatch. Click Connect again.",
  missing_google_env: "Google OAuth is not configured on the server.",
  missing_microsoft_env: "Microsoft OAuth is not configured on the server.",
  access_denied: "You cancelled or Google denied access.",
};

export function SettingsControls() {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("agent");
  const [oauth, setOauth] = useState<ConnectStatusResponse | null>(null);
  const [local, setLocal] = useState<ConnectedServicesState>(() =>
    readConnectedServices(readSession()?.userId),
  );
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverTitle, setWaiverTitle] = useState("Connect integration");
  const pendingConnectRef = useRef<(() => void) | null>(null);

  const [instructions, setInstructions] = useState("");
  const [instructionsSaving, setInstructionsSaving] = useState(false);
  const [instructionsMsg, setInstructionsMsg] = useState<string | null>(null);

  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillsSignedIn, setSkillsSignedIn] = useState(false);
  const [skillsBusy, setSkillsBusy] = useState<string | null>(null);
  const [skillImportOpen, setSkillImportOpen] = useState(false);
  const [skillMarkdown, setSkillMarkdown] = useState("");
  const [skillError, setSkillError] = useState<string | null>(null);

  const [apps, setApps] = useState<AppRow[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);

  const [mcpJson, setMcpJson] = useState(
    '{\n  "mcpServers": {}\n}',
  );
  const [mcpMsg, setMcpMsg] = useState<string | null>(null);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpSignedIn, setMcpSignedIn] = useState(false);

  const refreshOauth = useCallback(async () => {
    try {
      setOauth(await fetchConnectStatus());
    } catch {
      setOauth(null);
    }
  }, []);

  const refreshLocal = useCallback(
    () => setLocal(readConnectedServices(readSession()?.userId)),
    [],
  );

  const refreshSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills", { cache: "no-store" });
      const data = (await res.json()) as { skills?: SkillRow[]; signedIn?: boolean };
      setSkills(Array.isArray(data.skills) ? data.skills : []);
      setSkillsSignedIn(Boolean(data.signedIn));
    } catch {
      setSkills([]);
    }
  }, []);

  const refreshApps = useCallback(async () => {
    setAppsError(null);
    const session = readSession();
    if (!session?.userId) {
      setApps([]);
      return;
    }
    try {
      const res = await fetch("/api/apps", { cache: "no-store" });
      if (res.status === 401) {
        setApps([]);
        return;
      }
      const data = (await res.json()) as { apps?: AppRow[]; error?: string };
      if (!res.ok) {
        setAppsError(data.error ?? "Failed to load apps");
        return;
      }
      setApps(Array.isArray(data.apps) ? data.apps : []);
    } catch {
      setAppsError("Failed to load apps");
    }
  }, []);

  const refreshPrefs = useCallback(async () => {
    if (!readSession()?.userId) {
      setInstructions("");
      return;
    }
    try {
      const res = await fetch("/api/user/preferences", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        preferences?: { customInstructions?: string };
      };
      setInstructions(data.preferences?.customInstructions ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshLocal();
    const on = () => refreshLocal();
    window.addEventListener("smile-connected-services-changed", on);
    window.addEventListener("smile-auth-changed", on);
    return () => {
      window.removeEventListener("smile-connected-services-changed", on);
      window.removeEventListener("smile-auth-changed", on);
    };
  }, [refreshLocal]);

  useEffect(() => {
    const userId = readSession()?.userId;
    if (!userId) return;
    void syncConnectedServicesFromServer(userId).then(() => refreshLocal());
  }, [refreshLocal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const connected = u.searchParams.get("connected");
    const oauthErr = u.searchParams.get("oauth_error");
    if (connected || oauthErr) {
      void refreshOauth();
      const userId = readSession()?.userId;
      if (userId) void syncConnectedServicesFromServer(userId).then(() => refreshLocal());
      if (oauthErr) {
        setOauthError(OAUTH_ERROR_HINTS[oauthErr] ?? `Connection error: ${oauthErr}`);
      }
      u.searchParams.delete("connected");
      u.searchParams.delete("oauth_error");
      window.history.replaceState({}, "", `${u.pathname}${u.search}`);
    }
  }, [refreshOauth, refreshLocal]);

  const refreshMcp = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp", { cache: "no-store" });
      const data = (await res.json()) as {
        signedIn?: boolean;
        config?: { mcpServers?: Record<string, unknown> };
      };
      setMcpSignedIn(Boolean(data.signedIn));
      if (data.signedIn && data.config && Object.keys(data.config.mcpServers ?? {}).length > 0) {
        setMcpJson(JSON.stringify(data.config, null, 2));
        try {
          localStorage.setItem("fighur-mcp-config", JSON.stringify(data.config, null, 2));
        } catch {
          /* ignore */
        }
        return;
      }
    } catch {
      setMcpSignedIn(false);
    }
    try {
      const saved = localStorage.getItem("fighur-mcp-config");
      if (saved) setMcpJson(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setConnectError(null);
    void refreshOauth();
    void refreshSkills();
    void refreshPrefs();
    void refreshApps();
    void refreshMcp();
    const userId = readSession()?.userId;
    if (userId) void syncConnectedServicesFromServer(userId).then(() => refreshLocal());
  }, [open, refreshOauth, refreshLocal, refreshSkills, refreshPrefs, refreshApps, refreshMcp]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const persistLocal = useCallback((next: ConnectedServicesState) => {
    setLocal(next);
    writeConnectedServices(next, readSession()?.userId);
  }, []);

  const setWorkMode = (workMode: WorkMode) => {
    persistLocal({
      ...local,
      workMode,
      coworkDevice: workMode === "cowork",
    });
    const userId = readSession()?.userId;
    if (userId) void saveWorkModeToServer(workMode);
  };

  const saveInstructions = async () => {
    if (!readSession()?.userId) {
      setInstructionsMsg("Sign in to save custom instructions.");
      return;
    }
    setInstructionsSaving(true);
    setInstructionsMsg(null);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customInstructions: instructions }),
      });
      if (!res.ok) {
        setInstructionsMsg("Could not save.");
        return;
      }
      setInstructionsMsg("Saved.");
    } finally {
      setInstructionsSaving(false);
    }
  };

  const toggleSkill = async (name: string, enabled: boolean) => {
    if (!skillsSignedIn) {
      setSkillError("Sign in to enable or disable skills.");
      return;
    }
    setSkillsBusy(name);
    setSkillError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", name, enabled }),
      });
      const data = (await res.json()) as { skills?: SkillRow[]; error?: string };
      if (!res.ok) {
        setSkillError(data.error ?? "Toggle failed");
        return;
      }
      if (Array.isArray(data.skills)) setSkills(data.skills);
    } finally {
      setSkillsBusy(null);
    }
  };

  const importSkill = async () => {
    if (!skillsSignedIn) {
      setSkillError("Sign in to import skills.");
      return;
    }
    setSkillsBusy("import");
    setSkillError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", markdown: skillMarkdown }),
      });
      const data = (await res.json()) as { skills?: SkillRow[]; error?: string };
      if (!res.ok) {
        setSkillError(data.error ?? "Import failed");
        return;
      }
      if (Array.isArray(data.skills)) setSkills(data.skills);
      setSkillMarkdown("");
      setSkillImportOpen(false);
    } finally {
      setSkillsBusy(null);
    }
  };

  const exportSkill = async (name: string) => {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export", name }),
    });
    const data = (await res.json()) as { markdown?: string; error?: string };
    if (!res.ok || !data.markdown) {
      setSkillError(data.error ?? "Export failed");
      return;
    }
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.SKILL.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteSkill = async (name: string) => {
    setSkillsBusy(name);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", name }),
      });
      const data = (await res.json()) as { skills?: SkillRow[]; error?: string };
      if (!res.ok) {
        setSkillError(data.error ?? "Delete failed");
        return;
      }
      if (Array.isArray(data.skills)) setSkills(data.skills);
    } finally {
      setSkillsBusy(null);
    }
  };

  const archiveApp = async (id: string) => {
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", id }),
    });
    if (res.ok) void refreshApps();
  };

  const disconnectProvider = async (provider: "google" | "microsoft") => {
    setOauthBusy(provider);
    try {
      await fetch("/api/connect/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      await refreshOauth();
    } finally {
      setOauthBusy(null);
    }
  };

  const requirePrivacyWaiver = (kind: PrivacyWaiverKind, title: string, action: () => void) => {
    setConnectError(null);
    setOauthError(null);
    setDeviceError(null);
    const userId = readSession()?.userId;
    if (!userId) {
      setConnectError("Sign in first — connections are saved to your account on this server.");
      return;
    }
    if (hasAcceptedPrivacyWaiver(userId)) {
      action();
      return;
    }
    pendingConnectRef.current = action;
    setWaiverTitle(title);
    setWaiverOpen(true);
  };

  const connectGoogle = () =>
    requirePrivacyWaiver("google", "Connect Google (Gmail & Calendar)", () => {
      window.location.assign("/api/connect/google");
    });

  const connectMicrosoft = () =>
    requirePrivacyWaiver("microsoft", "Connect Microsoft (Outlook & Calendar)", () => {
      window.location.assign("/api/connect/microsoft");
    });

  const connectDeviceFolderHandler = async () => {
    const userId = readSession()?.userId;
    if (!userId) {
      setDeviceError("Sign in to link a folder to your account.");
      return;
    }
    if (!supportsDeviceFolderPicker()) {
      setDeviceError("This browser cannot pick folders. Use Safari or Chrome on desktop.");
      return;
    }
    requirePrivacyWaiver("device", "Connect this device folder", () => {
      void (async () => {
        setDeviceError(null);
        const result = await connectDeviceFolder(userId);
        if (result.ok) {
          const next = readConnectedServices(userId);
          next.services.deviceFiles = {
            connected: true,
            label:
              result.mode === "webkit"
                ? `${result.rootName} (Safari snapshot — plan only; use Chrome to apply moves)`
                : `${result.rootName} (read & organize)`,
          };
          persistLocal(next);
          return;
        }
        if ("cancelled" in result && result.cancelled) return;
        if ("error" in result) setDeviceError(result.error);
      })();
    });
  };

  const disconnectDevice = () => {
    void idbClearDeviceHandle(readSession()?.userId);
    const next = readConnectedServices(readSession()?.userId);
    next.services.deviceFiles = { connected: false };
    persistLocal(next);
  };

  const saveMcp = async () => {
    setMcpBusy(true);
    setMcpMsg(null);
    try {
      const parsed = JSON.parse(mcpJson) as unknown;
      localStorage.setItem("fighur-mcp-config", JSON.stringify(parsed, null, 2));
      if (mcpSignedIn || readSession()?.userId) {
        const res = await fetch("/api/mcp", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const data = (await res.json()) as { error?: string; ok?: boolean };
        if (!res.ok) {
          setMcpMsg(data.error || "Save failed");
          return;
        }
        setMcpMsg("Saved. Remote HTTP/SSE servers are callable in chat.");
      } else {
        setMcpMsg("Saved in this browser. Sign in to sync across devices.");
      }
    } catch {
      setMcpMsg("Invalid JSON.");
    } finally {
      setMcpBusy(false);
    }
  };

  const probeMcp = async () => {
    setMcpBusy(true);
    setMcpMsg(null);
    try {
      const parsed = JSON.parse(mcpJson) as unknown;
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe", config: parsed }),
      });
      const data = (await res.json()) as {
        error?: string;
        probes?: Array<{ serverId: string; ok: boolean; error?: string; tools?: unknown[] }>;
      };
      if (!res.ok) {
        setMcpMsg(data.error || "Probe failed");
        return;
      }
      const lines = (data.probes ?? []).map((p) =>
        p.ok
          ? `${p.serverId}: ok (${p.tools?.length ?? 0} tools)`
          : `${p.serverId}: ${p.error || "failed"}`,
      );
      setMcpMsg(lines.length ? lines.join(" · ") : "No servers configured");
    } catch {
      setMcpMsg("Invalid JSON.");
    } finally {
      setMcpBusy(false);
    }
  };

  const configured = oauth?.configured ?? false;
  const enabledSkillCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-white/[0.18] hover:text-[var(--text-primary)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Settings
        {local.workMode !== "chat" ? (
          <span className="ml-1.5 rounded-full bg-[var(--accent)]/20 px-1.5 py-0.5 text-[0.6rem] font-semibold text-[var(--accent)]">
            {workModeLabel(local.workMode)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] flex w-[min(28rem,calc(100vw-1.5rem))] max-h-[min(42rem,82vh)] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <div className="border-b border-white/[0.08] px-4 pt-3 pb-0">
            <p className="text-xs font-semibold text-[var(--text-primary)]">Settings</p>
            <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">
              Customize AI · Skills · Connectors · Apps — Abacus-style control surface
            </p>
            <div
              className="mt-3 flex gap-0.5 overflow-x-auto pb-2"
              role="tablist"
              aria-label="Settings sections"
            >
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[0.7rem] font-medium transition ${
                      active
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text-faint)] hover:bg-white/[0.04] hover:text-[var(--text-muted)]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === "agent" ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Customize AI</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Standing instructions applied to every chat (like Abacus Customize & Add Skills →
                  custom instructions). Skills auto-activate when relevant.
                </p>

                <label className="mt-4 block text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-faint)]">
                  Custom instructions
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={6}
                  placeholder="e.g. Prefer concise answers. Always cite sources. Our stack is Next.js + TypeScript…"
                  className="mt-1.5 w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-xs leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]/40 focus:outline-none"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={instructionsSaving}
                    onClick={() => void saveInstructions()}
                    className="rounded-full bg-[var(--accent)]/20 px-3 py-1.5 text-[0.7rem] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30 hover:bg-[var(--accent)]/30 disabled:opacity-40"
                  >
                    {instructionsSaving ? "Saving…" : "Save"}
                  </button>
                  {instructionsMsg ? (
                    <span className="text-[0.65rem] text-[var(--text-faint)]">{instructionsMsg}</span>
                  ) : null}
                </div>

                <p className="mt-5 text-xs font-semibold text-[var(--text-primary)]">Work mode</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  How FIGHURAI behaves this session — Chat, CoWork (knowledge work), or Codex (coding).
                </p>
                <ul className="mt-3 space-y-2" role="radiogroup" aria-label="Work mode">
                  {WORK_MODE_OPTIONS.map((opt) => {
                    const selected = local.workMode === opt.id;
                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setWorkMode(opt.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            selected
                              ? "border-[var(--accent)]/45 bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/25"
                              : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {opt.label}
                            </span>
                            <span className="text-[0.6rem] text-[var(--text-faint)]">
                              {opt.inspiredBy}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[0.65rem] font-medium text-[var(--accent)]/90">
                            {opt.tagline}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {tab === "skills" ? (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-primary)]">Agent Skills</p>
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                      {enabledSkillCount} enabled · Abacus-style SKILL.md packs. Auto-activate from
                      your prompt.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSkillImportOpen((v) => !v)}
                    className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[0.65rem] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                  >
                    + New Skill
                  </button>
                </div>

                {!skillsSignedIn ? (
                  <p className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[0.65rem] text-sky-100/95">
                    <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
                      Sign in
                    </Link>{" "}
                    to toggle, import, or export skills. Built-ins still auto-match while signed out.
                  </p>
                ) : null}

                {skillError ? (
                  <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[0.65rem] text-red-100/95">
                    {skillError}
                  </p>
                ) : null}

                {skillImportOpen ? (
                  <div className="mt-3 rounded-xl border border-white/[0.1] bg-black/25 p-3">
                    <p className="text-[0.7rem] font-medium text-[var(--text-primary)]">
                      Import SKILL.md
                    </p>
                    <p className="mt-1 text-[0.65rem] text-[var(--text-faint)]">
                      Paste a full skill file with YAML frontmatter (<code>name</code>,{" "}
                      <code>description</code>).
                    </p>
                    <textarea
                      value={skillMarkdown}
                      onChange={(e) => setSkillMarkdown(e.target.value)}
                      rows={8}
                      placeholder={"---\nname: my-skill\ndescription: Use when...\n---\n# Instructions\n..."}
                      className="mt-2 w-full resize-y rounded-lg border border-white/[0.1] bg-black/40 px-2.5 py-2 font-mono text-[0.65rem] text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={skillsBusy === "import" || !skillMarkdown.trim()}
                        onClick={() => void importSkill()}
                        className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-[0.65rem] font-semibold text-[var(--accent)] disabled:opacity-40"
                      >
                        Import
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkillImportOpen(false)}
                        className="rounded-full bg-white/[0.06] px-3 py-1 text-[0.65rem] text-[var(--text-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <ul className="mt-3 space-y-2">
                  {skills.map((s) => (
                    <li
                      key={s.name}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {s.name}
                            </span>
                            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wide text-[var(--text-faint)]">
                              {s.source}
                            </span>
                          </div>
                          <p className="mt-1 text-[0.65rem] leading-relaxed text-[var(--text-faint)]">
                            {s.description.slice(0, 160)}
                            {s.description.length > 160 ? "…" : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void exportSkill(s.name)}
                              className="text-[0.6rem] font-medium text-[var(--text-muted)] hover:text-[var(--accent)]"
                            >
                              Export
                            </button>
                            {s.source === "custom" ? (
                              <button
                                type="button"
                                disabled={skillsBusy === s.name}
                                onClick={() => void deleteSkill(s.name)}
                                className="text-[0.6rem] font-medium text-red-300/80 hover:text-red-200"
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={s.enabled}
                          disabled={Boolean(skillsBusy) || !skillsSignedIn}
                          onClick={() => void toggleSkill(s.name, !s.enabled)}
                          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
                            s.enabled ? "bg-[var(--accent)]" : "bg-white/15"
                          } disabled:opacity-40`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                              s.enabled ? "translate-x-4" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tab === "connectors" ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  First-party connectors
                </p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Connect under your identity — same model as Abacus First Party Connectors. Tokens
                  stay encrypted on this server.
                </p>
                {oauth?.needsSignInForConnect && configured ? (
                  <p className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[0.65rem] text-sky-100/95">
                    <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
                      Sign in
                    </Link>{" "}
                    so Google and Microsoft connect to your account.
                  </p>
                ) : null}
                {!configured ? (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[0.65rem] text-amber-100/90">
                    Set <code className="text-[0.6rem]">SMILE_APP_SECRET</code> plus Google / Microsoft
                    client IDs to enable connections.
                  </p>
                ) : null}
                {connectError || oauthError ? (
                  <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[0.65rem] text-red-100/95">
                    {connectError ?? oauthError}
                  </p>
                ) : null}

                {local.workMode === "cowork" ? (
                  <p className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/8 px-2.5 py-2 text-[0.65rem] leading-relaxed text-sky-100/90">
                    <span className="font-medium">CoWork tip:</span> connect This device · folder for
                    file-organizing plans.
                  </p>
                ) : null}

                <ul className="mt-3 space-y-2">
                  <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          Google · Gmail & Calendar
                        </p>
                        {oauth?.google.connected ? (
                          <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                            {oauth.google.email ?? "Connected"}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">Not connected</p>
                        )}
                      </div>
                      {oauth?.google.connected ? (
                        <button
                          type="button"
                          disabled={oauthBusy === "google"}
                          onClick={() => void disconnectProvider("google")}
                          className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-40"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={connectGoogle}
                          disabled={oauth?.google.available === false}
                          className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </li>

                  <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          Microsoft · Outlook & 365
                        </p>
                        {oauth?.microsoft.connected ? (
                          <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                            {oauth.microsoft.email ?? "Connected"}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">Not connected</p>
                        )}
                      </div>
                      {oauth?.microsoft.connected ? (
                        <button
                          type="button"
                          disabled={oauthBusy === "microsoft"}
                          onClick={() => void disconnectProvider("microsoft")}
                          className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-40"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={connectMicrosoft}
                          disabled={oauth?.microsoft.available === false}
                          className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  </li>

                  <li className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          This device · folder
                        </p>
                        {local.services.deviceFiles.connected ? (
                          <p className="mt-0.5 truncate text-[0.65rem] text-emerald-200/90">
                            {local.services.deviceFiles.label ?? "Folder granted"}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">
                            Pick a folder for CoWork file ops
                          </p>
                        )}
                      </div>
                      {local.services.deviceFiles.connected ? (
                        <button
                          type="button"
                          onClick={disconnectDevice}
                          className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:bg-white/[0.12]"
                        >
                          Clear
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void connectDeviceFolderHandler()}
                          className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.65rem] font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                        >
                          Choose…
                        </button>
                      )}
                    </div>
                    {deviceError ? (
                      <p className="mt-2 text-[0.65rem] text-red-300/90">{deviceError}</p>
                    ) : null}
                  </li>
                </ul>
              </div>
            ) : null}

            {tab === "apps" ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">App Management</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Apps saved via the <code className="text-[0.65rem]">save_app</code> tool or API.
                  Hosting and custom domains come next — registry is live now.
                </p>
                {!readSession()?.userId ? (
                  <p className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1.5 text-[0.65rem] text-sky-100/95">
                    <Link href="/sign-in" className="font-medium underline-offset-2 hover:underline">
                      Sign in
                    </Link>{" "}
                    to view and manage apps.
                  </p>
                ) : null}
                {appsError ? (
                  <p className="mt-2 text-[0.65rem] text-red-300/90">{appsError}</p>
                ) : null}
                {apps.length === 0 && readSession()?.userId ? (
                  <p className="mt-4 text-[0.7rem] text-[var(--text-faint)]">
                    No apps yet. Build something in chat, then ask FIGHURAI to{" "}
                    <span className="text-[var(--text-muted)]">save this app</span>.
                  </p>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {apps.map((app) => (
                    <li
                      key={app.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">
                            {app.name}
                          </p>
                          <p className="mt-0.5 text-[0.6rem] text-[var(--text-faint)]">
                            {app.slug} · {app.fileCount} files · {app.status}
                          </p>
                          {app.description ? (
                            <p className="mt-1 text-[0.65rem] text-[var(--text-muted)]">
                              {app.description.slice(0, 120)}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void archiveApp(app.id)}
                          className="shrink-0 rounded-full bg-white/[0.08] px-2.5 py-1 text-[0.65rem] text-[var(--text-muted)] hover:bg-white/[0.12]"
                        >
                          Archive
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tab === "mcp" ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  MCP Server Configuration
                </p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Paste OpenAI-style <code className="text-[0.65rem]">mcpServers</code> JSON.
                  Hosted FigHur runs <strong>remote HTTP/SSE</strong> servers (
                  <code className="text-[0.65rem]">url</code>
                  ). Stdio <code className="text-[0.65rem]">command</code> entries are saved but
                  need a desktop host.
                </p>
                <textarea
                  value={mcpJson}
                  onChange={(e) => setMcpJson(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className="mt-3 w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 font-mono text-[0.65rem] leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={mcpBusy}
                    onClick={() => void saveMcp()}
                    className="rounded-full bg-[var(--accent)]/20 px-3 py-1.5 text-[0.7rem] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30 disabled:opacity-50"
                  >
                    Save config
                  </button>
                  <button
                    type="button"
                    disabled={mcpBusy}
                    onClick={() => void probeMcp()}
                    className="rounded-full bg-white/[0.08] px-3 py-1.5 text-[0.7rem] text-[var(--text-muted)] hover:bg-white/[0.12] disabled:opacity-50"
                  >
                    Test connection
                  </button>
                  {mcpMsg ? (
                    <span className="text-[0.65rem] text-[var(--text-faint)]">{mcpMsg}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <PrivacyWaiverModal
        open={waiverOpen}
        title={waiverTitle}
        onCancel={() => {
          setWaiverOpen(false);
          pendingConnectRef.current = null;
        }}
        onAccept={() => {
          const userId = readSession()?.userId;
          if (userId) recordPrivacyWaiverAcceptance(userId);
          setWaiverOpen(false);
          const action = pendingConnectRef.current;
          pendingConnectRef.current = null;
          action?.();
        }}
      />
    </div>
  );
}
