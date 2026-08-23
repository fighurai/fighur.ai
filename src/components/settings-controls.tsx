"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ConnectStatusResponse } from "@/lib/connect-status-types";
import { readSession } from "@/lib/auth-storage";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import {
  readConnectedServices,
  writeConnectedServices,
  type ConnectedServicesState,
} from "@/lib/connected-services";
import { PrivacyWaiverModal } from "@/components/privacy-waiver-modal";
import { SettingsAppsPanel } from "@/components/settings/settings-apps-panel";
import { SettingsConnectorsPanel } from "@/components/settings/settings-connectors-panel";
import { SettingsMcpPanel } from "@/components/settings/settings-mcp-panel";
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
import {
  HEADER_PANEL_BACKDROP_CLASS,
  HEADER_PANEL_CLASS,
  HEADER_TRIGGER_CLASS,
} from "@/lib/header-panel";
import { WORK_MODE_OPTIONS, workModeLabel, type WorkMode } from "@/lib/work-mode";

type SettingsTab = "agent" | "skills" | "connectors" | "apps" | "tasks" | "mcp";

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
  deployedUrl?: string;
  updatedAt: string;
};

type TaskRow = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastResultPreview?: string;
};

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "agent", label: "Customize" },
  { id: "skills", label: "Skills" },
  { id: "connectors", label: "Connectors" },
  { id: "apps", label: "Apps" },
  { id: "tasks", label: "Tasks" },
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

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksEphemeral, setTasksEphemeral] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [taskSchedule, setTaskSchedule] = useState<"hourly" | "daily" | "weekly">("daily");
  const [taskBusy, setTaskBusy] = useState(false);

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

  const refreshTasks = useCallback(async () => {
    setTasksError(null);
    if (!readSession()?.userId) {
      setTasks([]);
      return;
    }
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (res.status === 401) {
        setTasks([]);
        return;
      }
      const data = (await res.json()) as {
        tasks?: TaskRow[];
        ephemeralStorage?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setTasksError(data.error ?? "Failed to load tasks");
        return;
      }
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setTasksEphemeral(Boolean(data.ephemeralStorage));
    } catch {
      setTasksError("Failed to load tasks");
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
        preferences?: {
          customInstructions?: string;
          behaviorInstructions?: string;
          responseInstructions?: string;
        };
      };
      const p = data.preferences;
      setInstructions(
        p?.behaviorInstructions ||
          p?.customInstructions ||
          "",
      );
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
    void refreshTasks();
    void refreshMcp();
    const userId = readSession()?.userId;
    if (userId) void syncConnectedServicesFromServer(userId).then(() => refreshLocal());
  }, [open, refreshOauth, refreshLocal, refreshSkills, refreshPrefs, refreshApps, refreshTasks, refreshMcp]);

  useEffect(() => {
    const onDoc = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (!open) return;
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  useEffect(() => {
    const openFromPage = () => setOpen(true);
    window.addEventListener("fighur-open-header-settings", openFromPage);
    return () => window.removeEventListener("fighur-open-header-settings", openFromPage);
  }, []);

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
        body: JSON.stringify({
          customInstructions: instructions,
          behaviorInstructions: instructions,
        }),
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

  const publishApp = async (id: string) => {
    setAppsError(null);
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", id }),
    });
    const data = (await res.json()) as { error?: string; app?: AppRow };
    if (!res.ok) {
      setAppsError(data.error ?? "Publish failed");
      return;
    }
    void refreshApps();
  };

  const unpublishApp = async (id: string) => {
    setAppsError(null);
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish", id }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setAppsError(data.error ?? "Unpublish failed");
      return;
    }
    void refreshApps();
  };

  const createTask = async () => {
    setTaskBusy(true);
    setTasksError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: taskName,
          prompt: taskPrompt,
          schedule: taskSchedule,
          enabled: true,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTasksError(data.error ?? "Create failed");
        return;
      }
      setTaskName("");
      setTaskPrompt("");
      void refreshTasks();
    } finally {
      setTaskBusy(false);
    }
  };

  const toggleTask = async (id: string, enabled: boolean) => {
    setTasksError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, enabled }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setTasksError(data.error ?? "Update failed");
      return;
    }
    void refreshTasks();
  };

  const deleteTask = async (id: string) => {
    setTasksError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setTasksError(data.error ?? "Delete failed");
      return;
    }
    void refreshTasks();
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
        className={HEADER_TRIGGER_CLASS}
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
        <>
          <button
            type="button"
            aria-label="Close settings"
            className={HEADER_PANEL_BACKDROP_CLASS}
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-label="Settings"
            className={`${HEADER_PANEL_CLASS} md:w-[min(32rem,calc(100vw-1.5rem))]`}
          >
          <div className="border-b border-white/[0.08] px-4 pt-3 pb-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Settings</p>
                <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">
                  Quick controls · full page for Tasks, Agents, Deep Research
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Link
                  href="/settings"
                  className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-1 text-[0.65rem] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20"
                  onClick={() => setOpen(false)}
                >
                  Open full settings
                </Link>
                {isPlatformAdminEmail(readSession()?.email) ? (
                  <Link
                    href="/admin"
                    className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-[0.65rem] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={() => setOpen(false)}
                  >
                    People tracker
                  </Link>
                ) : null}
              </div>
            </div>
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
                  Standing instructions applied to every chat. For{" "}
                  <strong>Behavior</strong> vs <strong>Response</strong> instructions, agents, and
                  deep research, use{" "}
                  <Link
                    href="/settings?tab=customize"
                    className="text-[var(--accent)] underline-offset-2 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    full Settings
                  </Link>
                  .
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
                      {enabledSkillCount} enabled · FIGHURAI skill packs. Auto-activate from
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

            {tab === "connectors" ? <SettingsConnectorsPanel /> : null}

            {tab === "apps" ? <SettingsAppsPanel /> : null}

            {tab === "tasks" ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-primary)]">Scheduled Tasks</p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Tasks moved to the full Settings page so you can edit prompts, run now, and inspect
                  full results — plus create custom Agents and Deep Research prefs.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link
                    href="/settings?tab=tasks"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2.5 text-center text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20"
                  >
                    Manage Tasks →
                  </Link>
                  <Link
                    href="/settings?tab=agents"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-center text-xs font-medium text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Build Agents →
                  </Link>
                  <Link
                    href="/settings?tab=research"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-center text-xs font-medium text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Deep Research →
                  </Link>
                </div>
                {tasks.length > 0 ? (
                  <ul className="mt-4 space-y-1.5">
                    {tasks.slice(0, 3).map((task) => (
                      <li
                        key={task.id}
                        className="rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[0.65rem] text-[var(--text-muted)]"
                      >
                        <span className="font-medium text-[var(--text-primary)]">{task.name}</span>
                        <span className="text-[var(--text-faint)]">
                          {" "}
                          · {task.schedule} · {task.enabled ? "on" : "off"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {tab === "mcp" ? <SettingsMcpPanel /> : null}
          </div>
          </div>
        </>
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
