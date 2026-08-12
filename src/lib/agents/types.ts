export type AgentEffort = "auto" | "low" | "high";

export type ManagedAgent = {
  id: string;
  name: string;
  description: string;
  /** How the agent approaches problems. */
  behaviorInstructions: string;
  /** Tone / format / persona. */
  responseInstructions: string;
  /** Prefer deep-research skill + multi-source synthesis. */
  deepResearch: boolean;
  effort: AgentEffort;
  /** Optional skill name allowlist; empty = auto-match. */
  skillAllowlist: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export const ACTIVE_AGENT_CHANGE_EVENT = "fighur-active-agent-changed";

export type ActiveAgentChangeDetail = {
  activeAgentId: string | null;
  agent?: Pick<ManagedAgent, "id" | "name" | "description" | "deepResearch" | "effort"> | null;
};

export function emitActiveAgentChange(detail: ActiveAgentChangeDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_AGENT_CHANGE_EVENT, { detail }));
}
