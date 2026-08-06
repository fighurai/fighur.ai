import { randomUUID } from "crypto";

import { syncUserScheduleIndex } from "@/lib/tasks/index";
import {
  computeNextRunAt,
  isTaskSchedulePreset,
  type TaskSchedulePreset,
} from "@/lib/tasks/schedule";
import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

const FILE = "tasks.json";
const MAX_TASKS = 15;
const MAX_NAME = 120;
const MAX_PROMPT = 4_000;
const MAX_RESULT = 8_000;

export type ManagedTaskStatus = "ok" | "error" | "skipped";

export type ManagedTask = {
  id: string;
  name: string;
  prompt: string;
  schedule: TaskSchedulePreset;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: ManagedTaskStatus;
  lastResult?: string;
  createdAt: string;
  updatedAt: string;
};

type TaskStore = {
  tasks: ManagedTask[];
  updatedAt: string;
};

function emptyStore(): TaskStore {
  return { tasks: [], updatedAt: new Date().toISOString() };
}

async function readStore(userId: string): Promise<TaskStore> {
  if (!isSafeUserId(userId)) return emptyStore();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as TaskStore;
    if (!Array.isArray(parsed.tasks)) return emptyStore();
    return {
      tasks: parsed.tasks,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(userId: string, store: TaskStore): Promise<TaskStore> {
  const next = { ...store, updatedAt: new Date().toISOString() };
  await writeUserFile(userId, FILE, JSON.stringify(next));
  await syncUserScheduleIndex(
    userId,
    next.tasks.map((t) => ({
      id: t.id,
      enabled: t.enabled,
      nextRunAt: t.nextRunAt,
    })),
  );
  return next;
}

export async function listManagedTasks(userId: string): Promise<ManagedTask[]> {
  const store = await readStore(userId);
  return store.tasks;
}

export async function getManagedTask(
  userId: string,
  taskId: string,
): Promise<ManagedTask | null> {
  const store = await readStore(userId);
  return store.tasks.find((t) => t.id === taskId) ?? null;
}

export async function createManagedTask(
  userId: string,
  input: {
    name: string;
    prompt: string;
    schedule: TaskSchedulePreset;
    enabled?: boolean;
  },
): Promise<ManagedTask> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  if (!isTaskSchedulePreset(input.schedule)) throw new Error("Invalid schedule");
  const name = input.name.trim().slice(0, MAX_NAME);
  const prompt = input.prompt.trim().slice(0, MAX_PROMPT);
  if (!name) throw new Error("name required");
  if (!prompt) throw new Error("prompt required");

  const store = await readStore(userId);
  if (store.tasks.length >= MAX_TASKS) {
    throw new Error(`Task limit reached (${MAX_TASKS})`);
  }

  const now = new Date().toISOString();
  const task: ManagedTask = {
    id: randomUUID(),
    name,
    prompt,
    schedule: input.schedule,
    enabled: input.enabled !== false,
    nextRunAt: computeNextRunAt(input.schedule, new Date()),
    createdAt: now,
    updatedAt: now,
  };
  store.tasks.unshift(task);
  await writeStore(userId, store);
  return task;
}

export async function updateManagedTask(
  userId: string,
  taskId: string,
  patch: Partial<Pick<ManagedTask, "name" | "prompt" | "schedule" | "enabled">>,
): Promise<ManagedTask | null> {
  const store = await readStore(userId);
  const idx = store.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const prev = store.tasks[idx]!;
  const next: ManagedTask = { ...prev, updatedAt: new Date().toISOString() };

  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, MAX_NAME);
    if (!name) throw new Error("name required");
    next.name = name;
  }
  if (typeof patch.prompt === "string") {
    const prompt = patch.prompt.trim().slice(0, MAX_PROMPT);
    if (!prompt) throw new Error("prompt required");
    next.prompt = prompt;
  }
  if (patch.schedule !== undefined) {
    if (!isTaskSchedulePreset(patch.schedule)) throw new Error("Invalid schedule");
    next.schedule = patch.schedule;
    next.nextRunAt = computeNextRunAt(patch.schedule, new Date());
  }
  if (typeof patch.enabled === "boolean") {
    next.enabled = patch.enabled;
    if (patch.enabled && !prev.enabled) {
      next.nextRunAt = computeNextRunAt(next.schedule, new Date());
    }
  }

  store.tasks[idx] = next;
  await writeStore(userId, store);
  return next;
}

export async function deleteManagedTask(userId: string, taskId: string): Promise<boolean> {
  const store = await readStore(userId);
  const before = store.tasks.length;
  store.tasks = store.tasks.filter((t) => t.id !== taskId);
  if (store.tasks.length === before) return false;
  await writeStore(userId, store);
  return true;
}

export async function recordTaskRunResult(
  userId: string,
  taskId: string,
  result: {
    status: ManagedTaskStatus;
    text: string;
    /** When set, becomes the next scheduled time (after claim/run). */
    nextRunAt: string;
  },
): Promise<ManagedTask | null> {
  const store = await readStore(userId);
  const idx = store.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const prev = store.tasks[idx]!;
  store.tasks[idx] = {
    ...prev,
    lastRunAt: new Date().toISOString(),
    lastStatus: result.status,
    lastResult: result.text.slice(0, MAX_RESULT),
    nextRunAt: result.nextRunAt,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(userId, store);
  return store.tasks[idx]!;
}

/** Claim a due task by pushing nextRunAt forward before the model call. */
export async function claimManagedTask(
  userId: string,
  taskId: string,
): Promise<ManagedTask | null> {
  const store = await readStore(userId);
  const idx = store.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) return null;
  const prev = store.tasks[idx]!;
  if (!prev.enabled) return null;
  const claimedNext = computeNextRunAt(prev.schedule, new Date());
  store.tasks[idx] = {
    ...prev,
    nextRunAt: claimedNext,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(userId, store);
  return { ...store.tasks[idx]!, nextRunAt: claimedNext };
}

export { MAX_TASKS, MAX_PROMPT, MAX_RESULT };
