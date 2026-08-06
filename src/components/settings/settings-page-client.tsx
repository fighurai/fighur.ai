"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { readSession } from "@/lib/auth-storage";
import { WORK_MODE_OPTIONS, type WorkMode } from "@/lib/work-mode";

type SettingsPageTab =
  | "customize"
  | "tasks"
  | "agents"
  | "research"
  | "skills"
  | "connectors"
  | "apps"
  | "mcp";

const TABS: { id: SettingsPageTab; label: string; blurb: string }[] = [
  { id: "customize", label: "Customize", blurb: "Behavior & response instructions" },
  { id: "tasks", label: "Tasks", blurb: "Scheduled agent workflows" },
  { id: "agents", label: "Agents", blurb: "Build custom AI agents" },
  { id: "research", label: "Deep Research", blurb: "Multi-source research prefs" },
  { id: "skills", label: "Skills", blurb: "Manage in quick Settings" },
  { id: "connectors", label: "Connectors", blurb: "Manage in quick Settings" },
  { id: "apps", label: "Apps", blurb: "Manage in quick Settings" },
  { id: "mcp", label: "MCP", blurb: "Manage in quick Settings" },
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
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as SettingsPageTab | null) || "customize";
  const [tab, setTab] = useState<SettingsPageTab>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "customize",
  );
  const [signedIn, setSignedIn] = useState(false);
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
    setSignedIn(Boolean(readSession()?.userId));
  }, []);

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
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", activeAgentId: id }),
      });
      await loadAgents();
    } finally {
      setAgentBusy(false);
    }
  };

  const quickLinkTabs = useMemo(
    () => TABS.filter((t) => ["skills", "connectors", "apps", "mcp"].includes(t.id)),
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            Workspace
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl font-semibold text-[var(--text-primary)]">
            Settings
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)]">
            Abacus-style control center — instructions, scheduled tasks, custom agents, and deep
            research. Quick connectors/skills stay in the header Settings menu.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          ← Back to chat
        </Link>
      </div>

      {!signedIn ? (
        <p className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100/95">
          <Link href="/sign-in" className="font-semibold underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to create agents, tasks, and sync preferences across devices.
        </p>
      ) : null}

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible">
          {TABS.filter((t) => !quickLinkTabs.includes(t)).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                const url = new URL(window.location.href);
                url.searchParams.set("tab", t.id);
                window.history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
              }}
              className={`rounded-xl px-3 py-2 text-left text-xs transition ${
                tab === t.id
                  ? "bg-[var(--accent)]/15 font-semibold text-[var(--accent)] ring-1 ring-[var(--accent)]/30"
                  : "text-[var(--text-muted)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="block">{t.label}</span>
              <span className="mt-0.5 hidden text-[0.65rem] font-normal text-[var(--text-faint)] md:block">
                {t.blurb}
              </span>
            </button>
          ))}
          <div className="mt-2 hidden border-t border-white/[0.06] pt-2 md:block">
            <p className="px-3 text-[0.6rem] uppercase tracking-wide text-[var(--text-faint)]">
              Also in header Settings
            </p>
            {quickLinkTabs.map((t) => (
              <p key={t.id} className="px-3 py-1 text-[0.7rem] text-[var(--text-muted)]">
                {t.label}
              </p>
            ))}
          </div>
        </nav>

        <section className="min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-[var(--bg-elevated)]/60 p-4 sm:p-5">
          {tab === "customize" ? (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Behavior instructions
                </h2>
                <p className="mt-1 text-[0.7rem] text-[var(--text-faint)]">
                  How FIGHURAI approaches problems — methods, tools to prefer, research depth (Abacus
                  Behavior Instructions).
                </p>
                <textarea
                  value={prefs.behaviorInstructions}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, behaviorInstructions: e.target.value }))
                  }
                  rows={5}
                  placeholder='e.g. "Always search the live web before answering time-sensitive questions. Prefer step-by-step plans for multi-part asks."'
                  className="mt-2 w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none"
                />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Response instructions
                </h2>
                <p className="mt-1 text-[0.7rem] text-[var(--text-faint)]">
                  Tone, persona, length, and structure of answers (Abacus Response Instructions).
                </p>
                <textarea
                  value={prefs.responseInstructions}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, responseInstructions: e.target.value }))
                  }
                  rows={5}
                  placeholder='e.g. "You are a concise technical consultant. Use short paragraphs and bullets. Confirm understanding before long plans."'
                  className="mt-2 w-full resize-y rounded-xl border border-white/[0.1] bg-black/30 px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/40 focus:outline-none"
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
                  Like Abacus Deep Research: prefer multi-source live web gathering, structured
                  findings, and citations when answering research-heavy questions. Uses your
                  deep-research skill and web tools.
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
                  Recurring agent workflows (Abacus Tasks). Create, edit, run now, and inspect full
                  results. Cron runs daily on Hobby; Pro can use higher frequency.
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
                  Build Abacus-style agents with behavior + response instructions, optional deep
                  research, and effort. Set one as <strong>Active</strong> — chat uses it until you
                  clear it.
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
        </section>
      </div>
    </div>
  );
}
