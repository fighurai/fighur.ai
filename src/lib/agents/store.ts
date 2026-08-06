import { randomUUID } from "crypto";

import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

const FILE = "agents.json";
const MAX_AGENTS = 20;
const MAX_NAME = 80;
const MAX_DESC = 400;
const MAX_INSTRUCTIONS = 6_000;

export type AgentEffort = "auto" | "low" | "high";

export type ManagedAgent = {
  id: string;
  name: string;
  description: string;
  /** How the agent approaches problems (Abacus Behavior Instructions). */
  behaviorInstructions: string;
  /** Tone / format / persona (Abacus Response Instructions). */
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

type AgentStore = {
  agents: ManagedAgent[];
  /** Last agent the user chose to use in chat. */
  activeAgentId: string | null;
  updatedAt: string;
};

function emptyStore(): AgentStore {
  return { agents: [], activeAgentId: null, updatedAt: new Date().toISOString() };
}

function clampText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, max);
}

function normalizeEffort(raw: unknown): AgentEffort {
  if (raw === "low" || raw === "high" || raw === "auto") return raw;
  return "auto";
}

function normalizeAgent(raw: Partial<ManagedAgent> & { id?: string }): ManagedAgent | null {
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const name = clampText(raw.name, MAX_NAME);
  if (!id || !name) return null;
  const skillAllowlist = Array.isArray(raw.skillAllowlist)
    ? raw.skillAllowlist.filter((s): s is string => typeof s === "string").slice(0, 12)
    : [];
  return {
    id,
    name,
    description: clampText(raw.description, MAX_DESC),
    behaviorInstructions: clampText(raw.behaviorInstructions, MAX_INSTRUCTIONS),
    responseInstructions: clampText(raw.responseInstructions, MAX_INSTRUCTIONS),
    deepResearch: Boolean(raw.deepResearch),
    effort: normalizeEffort(raw.effort),
    skillAllowlist,
    enabled: raw.enabled !== false,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

async function readStore(userId: string): Promise<AgentStore> {
  if (!isSafeUserId(userId)) return emptyStore();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as Partial<AgentStore>;
    const agents = Array.isArray(parsed.agents)
      ? parsed.agents.map((a) => normalizeAgent(a as Partial<ManagedAgent>)).filter(Boolean)
      : [];
    return {
      agents: agents as ManagedAgent[],
      activeAgentId: typeof parsed.activeAgentId === "string" ? parsed.activeAgentId : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(userId: string, store: AgentStore): Promise<AgentStore> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}

export async function listManagedAgents(userId: string): Promise<ManagedAgent[]> {
  return (await readStore(userId)).agents;
}

export async function getAgentStore(userId: string): Promise<AgentStore> {
  return readStore(userId);
}

export async function getManagedAgent(
  userId: string,
  agentId: string,
): Promise<ManagedAgent | null> {
  const store = await readStore(userId);
  return store.agents.find((a) => a.id === agentId) ?? null;
}

export async function getActiveManagedAgent(userId: string): Promise<ManagedAgent | null> {
  const store = await readStore(userId);
  if (!store.activeAgentId) return null;
  const agent = store.agents.find((a) => a.id === store.activeAgentId && a.enabled);
  return agent ?? null;
}

export async function createManagedAgent(
  userId: string,
  input: {
    name: string;
    description?: string;
    behaviorInstructions?: string;
    responseInstructions?: string;
    deepResearch?: boolean;
    effort?: AgentEffort;
    skillAllowlist?: string[];
    enabled?: boolean;
  },
): Promise<ManagedAgent> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const store = await readStore(userId);
  if (store.agents.length >= MAX_AGENTS) {
    throw new Error(`Agent limit reached (${MAX_AGENTS})`);
  }
  const name = clampText(input.name, MAX_NAME);
  if (!name) throw new Error("name required");
  const now = new Date().toISOString();
  const agent = normalizeAgent({
    id: randomUUID(),
    name,
    description: input.description,
    behaviorInstructions: input.behaviorInstructions,
    responseInstructions: input.responseInstructions,
    deepResearch: input.deepResearch,
    effort: input.effort,
    skillAllowlist: input.skillAllowlist,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  });
  if (!agent) throw new Error("Invalid agent");
  store.agents.unshift(agent);
  if (!store.activeAgentId) store.activeAgentId = agent.id;
  await writeStore(userId, store);
  return agent;
}

export async function updateManagedAgent(
  userId: string,
  agentId: string,
  patch: Partial<
    Pick<
      ManagedAgent,
      | "name"
      | "description"
      | "behaviorInstructions"
      | "responseInstructions"
      | "deepResearch"
      | "effort"
      | "skillAllowlist"
      | "enabled"
    >
  >,
): Promise<ManagedAgent | null> {
  const store = await readStore(userId);
  const idx = store.agents.findIndex((a) => a.id === agentId);
  if (idx < 0) return null;
  const merged = normalizeAgent({ ...store.agents[idx], ...patch, id: agentId });
  if (!merged) throw new Error("Invalid agent");
  merged.updatedAt = new Date().toISOString();
  store.agents[idx] = merged;
  await writeStore(userId, store);
  return merged;
}

export async function deleteManagedAgent(userId: string, agentId: string): Promise<boolean> {
  const store = await readStore(userId);
  const before = store.agents.length;
  store.agents = store.agents.filter((a) => a.id !== agentId);
  if (store.agents.length === before) return false;
  if (store.activeAgentId === agentId) {
    store.activeAgentId = store.agents[0]?.id ?? null;
  }
  await writeStore(userId, store);
  return true;
}

export async function setActiveManagedAgent(
  userId: string,
  agentId: string | null,
): Promise<AgentStore> {
  const store = await readStore(userId);
  if (agentId && !store.agents.some((a) => a.id === agentId)) {
    throw new Error("Agent not found");
  }
  store.activeAgentId = agentId;
  return writeStore(userId, store);
}

/** System prompt block for an active custom agent (Abacus-style). */
export function formatAgentSystemContext(agent: ManagedAgent | null | undefined): string {
  if (!agent || !agent.enabled) return "";
  const parts = [
    `## Active custom agent: ${agent.name}`,
    agent.description ? `Role: ${agent.description}` : "",
    agent.behaviorInstructions
      ? `### Behavior instructions\n${agent.behaviorInstructions}`
      : "",
    agent.responseInstructions
      ? `### Response instructions\n${agent.responseInstructions}`
      : "",
    agent.deepResearch
      ? "Deep research mode: prefer multi-source live web research, cite sources, and structure findings clearly."
      : "",
    agent.effort !== "auto"
      ? `Effort preference: ${agent.effort} (favor ${agent.effort === "high" ? "thorough multi-step reasoning" : "fast concise answers"}).`
      : "",
  ].filter(Boolean);
  return parts.length > 1 ? `\n\n${parts.join("\n\n")}` : "";
}
