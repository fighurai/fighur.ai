"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { readSession } from "@/lib/auth-storage";
import {
  ACTIVE_AGENT_CHANGE_EVENT,
  emitActiveAgentChange,
  type ManagedAgent,
} from "@/lib/agents/types";

type AgentRow = Pick<
  ManagedAgent,
  "id" | "name" | "description" | "deepResearch" | "effort" | "enabled"
>;

export function AgentsControls() {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(readSession()?.userId);

  const refresh = useCallback(async () => {
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
        setError(data.error || "Could not load agents");
        return;
      }
      setError(null);
      setAgents((data.agents ?? []).filter((a) => a.enabled !== false));
      setActiveAgentId(data.activeAgentId ?? null);
    } catch {
      setError("Could not load agents");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onAuth = () => void refresh();
    const onAgent = () => void refresh();
    window.addEventListener("smile-auth-changed", onAuth);
    window.addEventListener(ACTIVE_AGENT_CHANGE_EVENT, onAgent);
    return () => {
      window.removeEventListener("smile-auth-changed", onAuth);
      window.removeEventListener(ACTIVE_AGENT_CHANGE_EVENT, onAgent);
    };
  }, [refresh]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = agents.find((a) => a.id === activeAgentId) ?? null;

  const selectAgent = async (id: string | null, startChat: boolean) => {
    if (!readSession()?.userId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive", activeAgentId: id }),
      });
      const data = (await res.json()) as {
        activeAgentId?: string | null;
        agents?: AgentRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Could not switch agent");
        return;
      }
      const nextId = data.activeAgentId ?? null;
      setActiveAgentId(nextId);
      if (data.agents) setAgents(data.agents.filter((a) => a.enabled !== false));
      const agent = data.agents?.find((a) => a.id === nextId) ?? null;
      emitActiveAgentChange({ activeAgentId: nextId, agent });
      if (startChat) {
        window.dispatchEvent(new CustomEvent("smile-go-home"));
        setOpen(false);
      }
    } catch {
      setError("Could not switch agent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:border-white/[0.18] hover:text-[var(--text-primary)]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void refresh();
        }}
      >
        {active ? (
          <>
            <span className="text-[var(--text-faint)]">Agent · </span>
            <span className="font-semibold text-[var(--accent)]">{active.name}</span>
          </>
        ) : (
          "Agents"
        )}
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-2 px-1">
            <div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">Talk to an agent</p>
              <p className="mt-0.5 text-[0.65rem] leading-relaxed text-[var(--text-faint)]">
                Switch who FIGHURAI is for this chat. Agents use their real behavior & response
                instructions.
              </p>
            </div>
            <Link
              href="/settings?tab=agents"
              onClick={() => setOpen(false)}
              className="shrink-0 text-[0.65rem] font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Manage
            </Link>
          </div>

          {!signedIn ? (
            <p className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[0.65rem] text-sky-100/95">
              <Link href="/sign-in" className="font-semibold underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              to build and talk to custom agents.
            </p>
          ) : null}

          {error ? <p className="mt-2 text-[0.65rem] text-red-300/90">{error}</p> : null}

          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => void selectAgent(null, true)}
                className={`flex w-full flex-col rounded-xl px-2.5 py-2 text-left transition ${
                  !activeAgentId
                    ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/35"
                    : "hover:bg-white/[0.05]"
                }`}
              >
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  Default FIGHURAI
                </span>
                <span className="text-[0.65rem] text-[var(--text-faint)]">
                  General assistant (no custom agent)
                </span>
              </button>
            </li>
            {agents.map((agent) => {
              const selected = activeAgentId === agent.id;
              return (
                <li key={agent.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void selectAgent(agent.id, true)}
                    className={`flex w-full flex-col rounded-xl px-2.5 py-2 text-left transition ${
                      selected
                        ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/35"
                        : "hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {agent.name}
                      {selected ? (
                        <span className="ml-1.5 text-[0.6rem] font-medium text-[var(--accent)]">
                          active
                        </span>
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-[0.65rem] text-[var(--text-faint)]">
                      {agent.description ||
                        `${agent.effort} effort${agent.deepResearch ? " · deep research" : ""}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {signedIn && agents.length === 0 ? (
            <p className="mt-2 px-1 text-[0.65rem] text-[var(--text-faint)]">
              No agents yet. Create one in Settings or ask in chat: “Create an agent that…”
            </p>
          ) : null}

          <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-2">
            <Link
              href="/settings?tab=agents"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-full border border-white/[0.1] bg-white/[0.04] py-1.5 text-center text-[0.7rem] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Create agent
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
