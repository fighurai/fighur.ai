import { randomUUID } from "crypto";

import type { AgentEffort, ManagedAgent } from "@/lib/agents/types";
import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

export type { AgentEffort, ManagedAgent } from "@/lib/agents/types";

const FILE = "agents.json";
const MAX_AGENTS = 20;
const MAX_NAME = 80;
const MAX_DESC = 400;
const MAX_INSTRUCTIONS = 6_000;

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
    `## You are the custom agent: ${agent.name}`,
    "For this conversation you MUST embody this agent. Do not break character unless the user explicitly asks to switch agents.",
    agent.description ? `**Role / mission:** ${agent.description}` : "",
    agent.behaviorInstructions
      ? `### Behavior instructions (how you work)\n${agent.behaviorInstructions}`
      : "",
    agent.responseInstructions
      ? `### Response instructions (how you reply)\n${agent.responseInstructions}`
      : "",
    agent.deepResearch
      ? "### Deep research\nYou MUST use live web_search / fetch_url for factual or time-sensitive questions. Prefer multi-source synthesis with clear citations."
      : "",
    agent.effort === "high"
      ? "### Effort\nHigh effort: take multi-step approaches, use tools when helpful, and deliver thorough structured answers."
      : agent.effort === "low"
        ? "### Effort\nLow effort: answer quickly and concisely; minimize tool use unless necessary."
        : "",
    agent.skillAllowlist.length
      ? `Preferred skills (lean on these when relevant): ${agent.skillAllowlist.join(", ")}.`
      : "",
  ].filter(Boolean);
  return `\n\n${parts.join("\n\n")}`;
}
