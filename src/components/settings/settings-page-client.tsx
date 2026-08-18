"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { SettingsAppsPanel } from "@/components/settings/settings-apps-panel";
import { SettingsConnectorsPanel } from "@/components/settings/settings-connectors-panel";
import { SettingsExtensionPanel } from "@/components/settings/settings-extension-panel";
import { SettingsMcpPanel } from "@/components/settings/settings-mcp-panel";
import { clearSession, readSession } from "@/lib/auth-storage";
import { emitActiveAgentChange } from "@/lib/agents/types";
import { WORK_MODE_OPTIONS, type WorkMode } from "@/lib/work-mode";

type SettingsPageTab =
  | "account"
  | "customize"
  | "tasks"
  | "agents"
  | "research"
  | "skills"
  | "connectors"
  | "apps"
  | "extension"
  | "mcp";

const NAV_GROUPS: { label: string; ids: SettingsPageTab[] }[] = [
  { label: "Account", ids: ["account"] },
  { label: "Preferences", ids: ["customize", "research"] },
  { label: "Automation", ids: ["tasks", "agents"] },
  { label: "Integrations", ids: ["skills", "connectors", "apps", "extension", "mcp"] },
];

const TABS: { id: SettingsPageTab; label: string; blurb: string }[] = [
  { id: "account", label: "Account", blurb: "Profile, legal, delete" },
  { id: "customize", label: "Customize", blurb: "Behavior & response" },
  { id: "tasks", label: "Tasks", blurb: "Scheduled workflows" },
  { id: "agents", label: "Agents", blurb: "Custom chat agents" },
  { id: "research", label: "Deep Research", blurb: "Research preferences" },
  { id: "skills", label: "Skills", blurb: "Skill packs & toggles" },
  { id: "connectors", label: "Connectors", blurb: "Google, Microsoft, Slack, and more" },
  { id: "apps", label: "Apps", blurb: "Saved apps & conversation builds" },
  { id: "extension", label: "Extension", blurb: "FIGHURAI Colors for Chrome" },
  { id: "mcp", label: "MCP", blurb: "Custom remote MCP servers" },
];

type TaskRow = {
  id: string;
  name: string;
  prompt: string;
  schedule: "hourly" | "daily" | "weekly";
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: string;
  lastResultPreview?: string;
  lastResult?: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  description: string;
  behaviorInstructions: string;
  responseInstructions: string;
  deepResearch: boolean;
  effort: "auto" | "low" | "high";
  skillAllowlist: string[];
  enabled: boolean;
};

type PrefsState = {
  workMode: WorkMode;
  behaviorInstructions: string;
  responseInstructions: string;
  deepResearch: {
    enabled: boolean;
    citeSources: boolean;
    effort: "auto" | "low" | "high";
  };
};

const defaultPrefs = (): PrefsState => ({
  workMode: "chat",
  behaviorInstructions: "",
  responseInstructions: "",
  deepResearch: { enabled: false, citeSources: true, effort: "auto" },
});

export function SettingsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as SettingsPageTab | null) || "customize";
  const [tab, setTab] = useState<SettingsPageTab>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "customize",
  );
  const [signedIn, setSignedIn] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [prefs, setPrefs] = useState<PrefsState>(defaultPrefs);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [taskSchedule, setTaskSchedule] = useState<"hourly" | "daily" | "weekly">("daily");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentForm, setAgentForm] = useState({
    name: "",
    description: "",
    behaviorInstructions: "",
    responseInstructions: "",
    deepResearch: false,
    effort: "auto" as "auto" | "low" | "high",
  });
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("tab") as SettingsPageTab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = document.querySelector(`[data-settings-pill="${tab}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [tab]);

  useEffect(() => {
    const s = readSession();
    setSignedIn(Boolean(s?.userId));
    setAccountEmail(s?.email ?? null);
  }, []);

  const deleteAccount = async () => {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      setDeleteMsg('Type DELETE to confirm.');
      return;
    }
    setDeleteBusy(true);
    setDeleteMsg(null);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE", credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDeleteMsg(data.error || "Could not delete account.");
        return;
      }
      clearSession();
      setSignedIn(false);
      setAccountEmail(null);
      router.push("/?accountDeleted=1");
    } catch {
      setDeleteMsg("Could not delete account.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const loadPrefs = useCallback(async () => {
    if (!readSession()?.userId) return;
    try {
      const res = await fetch("/api/user/preferences", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { preferences?: Partial<PrefsState> & { customInstructions?: string } };
      const p = data.preferences;
      if (!p) return;
      setPrefs({
        workMode: (p.workMode as WorkMode) || "chat",
        behaviorInstructions:
          p.behaviorInstructions ||
          (!p.responseInstructions ? p.customInstructions || "" : "") ||
          "",
        responseInstructions: p.responseInstructions || "",
        deepResearch: {
          enabled: Boolean(p.deepResearch?.enabled),
          citeSources: p.deepResearch?.citeSources !== false,
          effort: p.deepResearch?.effort || "auto",
        },
      });
    } catch {
      /* ignore */
    }
  }, []);

  const loadTasks = useCallback(async () => {
    if (!readSession()?.userId) {
      setTasks([]);
      return;
    }
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data = (await res.json()) as { tasks?: TaskRow[]; error?: string };
      if (!res.ok) {
        setTasksError(data.error || "Could not load tasks");
        return;
      }
      setTasksError(null);
      setTasks(data.tasks ?? []);
    } catch {
      setTasksError("Could not load tasks");
    }
  }, []);

  const loadAgents = useCallback(async () => {
    if (!readSession()?.userId) {
      setAgents([]);
      setActiveAgentId(null);
      return;
    }
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = (await res.json()) as {
        agents?: AgentRow[];
        activeAgentId?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setAgentsError(data.error || "Could not load agents");
        return;
      }
      setAgentsError(null);
      setAgents(data.agents ?? []);
      setActiveAgentId(data.activeAgentId ?? null);
    } catch {
      setAgentsError("Could not load agents");
    }
  }, []);

  useEffect(() => {
    void loadPrefs();
    void loadTasks();
    void loadAgents();
  }, [loadPrefs, loadTasks, loadAgents]);

  const savePrefs = async (patch?: Partial<PrefsState>) => {
    if (!readSession()?.userId) {
      setPrefsMsg("Sign in to save preferences.");
      return;
    }
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setPrefsBusy(true);
    setPrefsMsg(null);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workMode: next.workMode,
          behaviorInstructions: next.behaviorInstructions,
          responseInstructions: next.responseInstructions,
          deepResearch: next.deepResearch,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPrefsMsg(data.error || "Save failed");
        return;
      }
      setPrefsMsg("Saved.");
    } catch {
      setPrefsMsg("Save failed");
    } finally {
      setPrefsBusy(false);
    }
  };

  const createOrUpdateTask = async () => {
    if (!taskName.trim() || !taskPrompt.trim()) return;
    setTaskBusy(true);
    setTasksError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingTaskId
            ? {
                action: "update",
                id: editingTaskId,
                name: taskName,
                prompt: taskPrompt,
                schedule: taskSchedule,
              }
            : {
                action: "create",
                name: taskName,
                prompt: taskPrompt,
                schedule: taskSchedule,
              },
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTasksError(data.error || "Task save failed");
        return;
      }
      setTaskName("");
      setTaskPrompt("");
      setTaskSchedule("daily");
      setEditingTaskId(null);
      await loadTasks();
    } catch {
      setTasksError("Task save failed");
    } finally {
      setTaskBusy(false);
    }
  };

  const taskAction = async (action: "delete" | "run" | "update", id: string, enabled?: boolean) => {
    setTaskBusy(true);
    try {
      const body =
        action === "update"
          ? { action, id, enabled }
          : { action, id };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setTasksError(data.error || "Task action failed");
      }
      await loadTasks();
    } finally {
      setTaskBusy(false);
    }
  };

  const saveAgent = async () => {
    if (!agentForm.name.trim()) return;
    setAgentBusy(true);
    setAgentsError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingAgentId
            ? { action: "update", id: editingAgentId, ...agentForm }
            : { action: "create", ...agentForm },
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAgentsError(data.error || "Agent save failed");
        return;
      }
      setAgentForm({
        name: "",
        description: "",
        behaviorInstructions: "",
        responseInstructions: "",
        deepResearch: false,
        effort: "auto",
      });
      setEditingAgentId(null);
      await loadAgents();
    } catch {
      setAgentsError("Agent save failed");
    } finally {
      setAgentBusy(false);
    }
  };

  const setActive = async (id: string | null) => {
    setAgentBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", activeAgentId: id }),
      });
      const data = (await res.json()) as {
        activeAgentId?: string | null;
        agents?: AgentRow[];
      };
      await loadAgents();
      const agent = data.agents?.find((a) => a.id === (data.activeAgentId ?? id)) ?? null;
      emitActiveAgentChange({
        activeAgentId: data.activeAgentId ?? id,
        agent: agent
          ? {
              id: agent.id,
              name: agent.name,
              description: agent.description,
              deepResearch: agent.deepResearch,
              effort: agent.effort,
            }
          : null,
      });
    } finally {
      setAgentBusy(false);
    }
  };

  const tabMeta = TABS.find((t) => t.id === tab) ?? TABS[0]!;

  const selectTab = (id: SettingsPageTab) => {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
  };

  const openHeaderSettings = () => {
    router.push("/");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("fighur-open-header-settings"));
    }, 400);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* —— Mobile: compact iOS-style header + scrolling pills —— */}
        <div className="shrink-0 border-b border-white/[0.08] bg-[var(--bg-elevated)]/80 md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Workspace
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                Settings
              </h1>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
            >
              Done
            </Link>
          </div>

          {!signedIn ? (
            <p className="mx-4 mb-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-1.5 text-[0.7rem] leading-snug text-sky-100/95">
              <Link href="/sign-in" className="font-semibold underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              to sync prefs.
            </p>
          ) : null}

          <nav
            aria-label="Settings sections"
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 pb-3 pt-1 [-webkit-overflow-scrolling:touch] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  data-settings-pill={t.id}
                  className={`snap-start shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8rem] font-medium transition ${
                    active
                      ? "bg-[var(--accent)] text-[var(--bg-deep)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "bg-white/[0.06] text-[var(--text-muted)] ring-1 ring-white/[0.08]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* —— Desktop: full nav rail —— */}
        <aside className="hidden shrink-0 flex-col border-b border-white/[0.06] bg-[var(--bg-elevated)]/50 md:flex md:w-[15.5rem] md:border-b-0 md:border-r md:border-white/[0.08]">
          <div className="shrink-0 px-5 pb-3 pt-5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              Workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Settings
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
              Pick a section below.
            </p>
          </div>

          {!signedIn ? (
            <p className="mx-5 mb-3 shrink-0 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[0.7rem] text-sky-100/95">
              <Link href="/sign-in" className="font-semibold underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              to sync prefs, agents, and tasks.
            </p>
          ) : null}

          <nav
            aria-label="Settings sections"
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-5"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-4 flex flex-col gap-0.5">
                <p className="px-2.5 pb-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                  {group.label}
                </p>
                {group.ids.map((id) => {
                  const t = TABS.find((x) => x.id === id)!;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTab(t.id)}
                      className={`w-full rounded-xl px-2.5 py-2 text-left text-xs transition ${
                        tab === t.id
                          ? "bg-[var(--accent)]/15 font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                          : "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="block">{t.label}</span>
                      <span className="mt-0.5 block text-[0.65rem] font-normal leading-snug text-[var(--text-faint)]">
                        {t.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-auto shrink-0 border-t border-white/[0.06] px-4 py-3">
            <Link
              href="/"
              className="inline-flex text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
            >
              ← Back to chat
            </Link>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:p-5 md:pl-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-elevated)]/40 md:rounded-2xl md:border md:border-white/[0.08] md:bg-[var(--bg-elevated)]/70 md:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="shrink-0 border-b border-white/[0.06] px-4 py-3 sm:px-5">
              <h2 className="text-base font-semibold text-[var(--text-primary)] sm:text-lg">
                {tabMeta.label}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)] sm:text-sm">{tabMeta.blurb}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:p-5 sm:pb-8">
          {tab === "account" ? (
            <div className="space-y-6">
              {signedIn ? (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-faint)]">
                    Signed in as
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">{accountEmail || "Account"}</p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  <Link href="/sign-in" className="text-[var(--accent)] underline">
                    Sign in
                  </Link>{" "}
                  to manage your account.
                </p>
              )}
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href="/privacy" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  Terms of Use
                </Link>
                <Link href="/support" className="text-[var(--accent)] underline-offset-2 hover:underline">
                  Support
                </Link>
              </div>
              {signedIn ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                  <h3 className="text-sm font-semibold text-red-300">Delete account</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                    Permanently deletes your account, chats, agents, tasks, apps, and connector tokens
                    stored on our servers. This cannot be undone. App Store / Stripe subscriptions must
                    be canceled separately in Apple ID or your billing portal.
                  </p>
                  <label className="mt-3 block text-xs text-[var(--text-muted)]">
                    Type DELETE to confirm
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)]"
                      autoComplete="off"
                    />
                  </label>
                  {deleteMsg ? <p className="mt-2 text-xs text-red-300">{deleteMsg}</p> : null}
                  <button
                    type="button"
                    disabled={deleteBusy}
                    onClick={() => void deleteAccount()}
                    className="mt-3 rounded-full border border-red-400/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {deleteBusy ? "Deleting…" : "Delete my account"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "customize" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Behavior instructions
                </h2>
                <p className="mt-1 text-[0.7rem] text-[var(--text-faint)]">
                  How FIGHURAI approaches problems — methods, tools to prefer, and research depth.
                </p>
                <textarea
                  value={prefs.behaviorInstructions}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, behaviorInstructions: e.target.value }))
                  }
                  rows={5}
                  placeholder='e.g. "Always search the live web before answering time-sensitive questions. Prefer step-by-step plans for multi-part asks."'
                  className="mt-2 w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-base text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none md:text-sm"
                />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Response instructions
                </h2>
                <p className="mt-1 text-[0.7rem] text-[var(--text-faint)]">
                  Tone, persona, length, and structure of answers.
                </p>
                <textarea
                  value={prefs.responseInstructions}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, responseInstructions: e.target.value }))
                  }
                  rows={5}
                  placeholder='e.g. "You are a concise technical consultant. Use short paragraphs and bullets. Confirm understanding before long plans."'
                  className="mt-2 w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-base text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none md:text-sm"
                />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Work mode</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WORK_MODE_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void savePrefs({ workMode: m.id })}
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        prefs.workMode === m.id
                          ? "bg-[var(--accent)]/20 font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/35"
                          : "border border-white/[0.1] text-[var(--text-muted)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={prefsBusy}
                  onClick={() => void savePrefs()}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] disabled:opacity-50"
                >
                  Save instructions
                </button>
                {prefsMsg ? (
                  <span className="text-[0.7rem] text-[var(--text-muted)]">{prefsMsg}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === "research" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Deep Research</h2>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Prefer multi-source live web gathering, structured findings, and citations when
                  answering research-heavy questions. Uses your deep-research skill and web tools.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={prefs.deepResearch.enabled}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      deepResearch: { ...p.deepResearch, enabled: e.target.checked },
                    }))
                  }
                  className="rounded border-white/20"
                />
                Enable Deep Research preference in chat
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={prefs.deepResearch.citeSources}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      deepResearch: { ...p.deepResearch, citeSources: e.target.checked },
                    }))
                  }
                  className="rounded border-white/20"
                />
                Require source citations / links
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
                <span>Research effort</span>
                <select
                  value={prefs.deepResearch.effort}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      deepResearch: {
                        ...p.deepResearch,
                        effort: e.target.value as "auto" | "low" | "high",
                      },
                    }))
                  }
                  className="rounded-lg border border-white/[0.1] bg-black/30 px-2 py-1 text-xs text-[var(--text-primary)]"
                >
                  <option value="auto">Auto</option>
                  <option value="low">Low (faster)</option>
                  <option value="high">High (thorough)</option>
                </select>
              </label>
              <button
                type="button"
                disabled={prefsBusy}
                onClick={() => void savePrefs()}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] disabled:opacity-50"
              >
                Save Deep Research
              </button>
              {prefsMsg ? (
                <span className="ml-2 text-[0.7rem] text-[var(--text-muted)]">{prefsMsg}</span>
              ) : null}
            </div>
          ) : null}

          {tab === "tasks" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Scheduled Tasks</h2>
                <p className="mt-1 text-[0.7rem] text-[var(--text-faint)]">
                  Recurring agent workflows. Create, edit, run now, and inspect full results. Cron
                  runs daily on Hobby; Pro can use higher frequency.
                </p>
              </div>
              {tasksError ? (
                <p className="text-xs text-red-300/90">{tasksError}</p>
              ) : null}
              <div className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="Task name"
                  className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Prompt to run on schedule…"
                  rows={4}
                  className="w-full resize-y rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={taskSchedule}
                    onChange={(e) =>
                      setTaskSchedule(e.target.value as "hourly" | "daily" | "weekly")
                    }
                    className="rounded-full border border-white/[0.1] bg-black/30 px-2.5 py-1 text-[0.65rem] text-[var(--text-muted)]"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                  <button
                    type="button"
                    disabled={taskBusy || !taskName.trim() || !taskPrompt.trim()}
                    onClick={() => void createOrUpdateTask()}
                    className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-[0.7rem] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30 disabled:opacity-50"
                  >
                    {editingTaskId ? "Update task" : "Create task"}
                  </button>
                  {editingTaskId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTaskId(null);
                        setTaskName("");
                        setTaskPrompt("");
                      }}
                      className="text-[0.7rem] text-[var(--text-faint)] underline-offset-2 hover:underline"
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </div>
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {task.name}
                        </p>
                        <p className="mt-0.5 text-[0.6rem] text-[var(--text-faint)]">
                          {task.schedule} · {task.enabled ? "on" : "off"} · next{" "}
                          {new Date(task.nextRunAt).toLocaleString()}
                        </p>
                        {task.lastStatus ? (
                          <p className="mt-1 text-[0.65rem] text-[var(--text-muted)]">
                            Last: {task.lastStatus}
                            {task.lastResultPreview ? ` — ${task.lastResultPreview}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={taskBusy}
                          onClick={() => void taskAction("run", task.id)}
                          className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          Run now
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTaskId(task.id);
                            setTaskName(task.name);
                            setTaskPrompt(task.prompt);
                            setTaskSchedule(task.schedule);
                          }}
                          className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={taskBusy}
                          onClick={() => void taskAction("update", task.id, !task.enabled)}
                          className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)]"
                        >
                          {task.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTaskId((id) => (id === task.id ? null : task.id))
                          }
                          className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)]"
                        >
                          {expandedTaskId === task.id ? "Hide" : "Result"}
                        </button>
                        <button
                          type="button"
                          disabled={taskBusy}
                          onClick={() => void taskAction("delete", task.id)}
                          className="rounded-full border border-red-500/30 px-2 py-0.5 text-[0.65rem] text-red-300/90"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedTaskId === task.id ? (
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-2 text-[0.65rem] text-[var(--text-muted)]">
                        {task.lastResult || task.prompt || "(no result yet)"}
                      </pre>
                    ) : null}
                  </li>
                ))}
                {tasks.length === 0 ? (
                  <p className="text-xs text-[var(--text-faint)]">No tasks yet.</p>
                ) : null}
              </ul>
            </div>
          ) : null}

          {tab === "agents" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Custom Agents</h2>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
                  Build custom agents with behavior + response instructions, optional deep research,
                  and effort. Set one as <strong>Active</strong> — chat uses it until you clear it.
                </p>
              </div>
              {agentsError ? (
                <p className="text-xs text-red-300/90">{agentsError}</p>
              ) : null}
              <div className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                <input
                  value={agentForm.name}
                  onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Agent name (e.g. Research analyst)"
                  className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <input
                  value={agentForm.description}
                  onChange={(e) => setAgentForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short role description"
                  className="w-full rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <textarea
                  value={agentForm.behaviorInstructions}
                  onChange={(e) =>
                    setAgentForm((f) => ({ ...f, behaviorInstructions: e.target.value }))
                  }
                  placeholder="Behavior instructions…"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <textarea
                  value={agentForm.responseInstructions}
                  onChange={(e) =>
                    setAgentForm((f) => ({ ...f, responseInstructions: e.target.value }))
                  }
                  placeholder="Response instructions…"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-white/[0.1] bg-black/30 px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[0.7rem] text-[var(--text-muted)]">
                    <input
                      type="checkbox"
                      checked={agentForm.deepResearch}
                      onChange={(e) =>
                        setAgentForm((f) => ({ ...f, deepResearch: e.target.checked }))
                      }
                      className="rounded border-white/20"
                    />
                    Deep research
                  </label>
                  <select
                    value={agentForm.effort}
                    onChange={(e) =>
                      setAgentForm((f) => ({
                        ...f,
                        effort: e.target.value as "auto" | "low" | "high",
                      }))
                    }
                    className="rounded-full border border-white/[0.1] bg-black/30 px-2.5 py-1 text-[0.65rem] text-[var(--text-muted)]"
                  >
                    <option value="auto">Effort: Auto</option>
                    <option value="low">Effort: Low</option>
                    <option value="high">Effort: High</option>
                  </select>
                  <button
                    type="button"
                    disabled={agentBusy || !agentForm.name.trim()}
                    onClick={() => void saveAgent()}
                    className="rounded-full bg-[var(--accent)]/20 px-3 py-1 text-[0.7rem] font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30 disabled:opacity-50"
                  >
                    {editingAgentId ? "Update agent" : "Create agent"}
                  </button>
                  {editingAgentId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAgentId(null);
                        setAgentForm({
                          name: "",
                          description: "",
                          behaviorInstructions: "",
                          responseInstructions: "",
                          deepResearch: false,
                          effort: "auto",
                        });
                      }}
                      className="text-[0.7rem] text-[var(--text-faint)] underline-offset-2 hover:underline"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
              <ul className="space-y-2">
                {agents.map((agent) => (
                  <li
                    key={agent.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      activeAgentId === agent.id
                        ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
                        : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {agent.name}
                          {activeAgentId === agent.id ? (
                            <span className="ml-2 text-[0.6rem] font-medium text-[var(--accent)]">
                              Active in chat
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[0.65rem] text-[var(--text-faint)]">
                          {agent.description || "No description"} · effort {agent.effort}
                          {agent.deepResearch ? " · deep research" : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={agentBusy}
                          onClick={() =>
                            void setActive(activeAgentId === agent.id ? null : agent.id)
                          }
                          className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)]"
                        >
                          {activeAgentId === agent.id ? "Clear active" : "Use in chat"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAgentId(agent.id);
                            setAgentForm({
                              name: agent.name,
                              description: agent.description,
                              behaviorInstructions: agent.behaviorInstructions,
                              responseInstructions: agent.responseInstructions,
                              deepResearch: agent.deepResearch,
                              effort: agent.effort,
                            });
                          }}
                          className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[0.65rem] text-[var(--text-muted)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={agentBusy}
                          onClick={async () => {
                            setAgentBusy(true);
                            await fetch("/api/agents", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "delete", id: agent.id }),
                            });
                            await loadAgents();
                            setAgentBusy(false);
                          }}
                          className="rounded-full border border-red-500/30 px-2 py-0.5 text-[0.65rem] text-red-300/90"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {agents.length === 0 ? (
                  <p className="text-xs text-[var(--text-faint)]">No agents yet — create one above.</p>
                ) : null}
              </ul>
            </div>
          ) : null}

          {tab === "skills" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Skills</h3>
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  Enable skill packs, import SKILL.md files, and control what tools the agent can use.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openHeaderSettings}
                    className="rounded-full bg-[var(--accent)]/15 px-4 py-2 text-xs font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30 transition hover:bg-[var(--accent)]/25"
                  >
                    Open skill controls
                  </button>
                  <Link
                    href="/"
                    className="rounded-full border border-white/[0.1] px-4 py-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    Back to chat
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "connectors" ? <SettingsConnectorsPanel /> : null}
          {tab === "apps" ? <SettingsAppsPanel /> : null}
          {tab === "extension" ? <SettingsExtensionPanel /> : null}
          {tab === "mcp" ? <SettingsMcpPanel /> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
