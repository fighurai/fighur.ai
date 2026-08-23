import { randomUUID } from "crypto";

import { syncUserScheduleIndex } from "@/lib/tasks/index";
import {
  clampHour,
  clampMinute,
  computeNextRunAt,
  inferScheduleOptions,
  isTaskSchedulePreset,
  resolveTaskTimeZone,
  type TaskScheduleOptions,
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
  /** IANA zone for daily/weekly local time (default America/New_York). */
  timeZone?: string;
  /** Local hour (0–23) for daily/weekly. Default 8. */
  hour?: number;
  minute?: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  lastStatus?: ManagedTaskStatus;
  lastResult?: string;
  lastConversationId?: string;
  createdAt: string;
  updatedAt: string;
};

export function scheduleOptionsFromTask(task: Pick<ManagedTask, "timeZone" | "hour" | "minute">): TaskScheduleOptions {
  return {
    timeZone: resolveTaskTimeZone(task.timeZone),
    hour: clampHour(task.hour),
    minute: clampMinute(task.minute),
  };
}

type TaskStore = {
  tasks: ManagedTask[];
  updatedAt: string;
};

function emptyStore(): TaskStore {
  return { tasks: [], updatedAt: new Date().toISOString() };
}

function backfillSchedule(task: ManagedTask): ManagedTask {
  if (task.timeZone && task.hour !== undefined) return task;
  const inferred = inferScheduleOptions(task.prompt, {
    timeZone: task.timeZone,
    hour: task.hour,
    minute: task.minute,
  });
  return {
    ...task,
    timeZone: inferred.timeZone,
    hour: inferred.hour,
    minute: inferred.minute,
    nextRunAt: computeNextRunAt(task.schedule, new Date(), inferred),
  };
}

async function readStore(userId: string): Promise<TaskStore> {
  if (!isSafeUserId(userId)) return emptyStore();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as TaskStore;
    if (!Array.isArray(parsed.tasks)) return emptyStore();
    const tasks = parsed.tasks;
    const needsBackfill = tasks.some((t) => !t.timeZone || t.hour === undefined);
    const store: TaskStore = {
      tasks: needsBackfill ? tasks.map(backfillSchedule) : tasks,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
    if (needsBackfill) return writeStore(userId, store);
    return store;
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
    timeZone?: string;
    hour?: number;
    minute?: number;
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

  const inferred = inferScheduleOptions(prompt, { timeZone: input.timeZone });
  if (input.hour !== undefined) inferred.hour = clampHour(input.hour);
  if (input.minute !== undefined) inferred.minute = clampMinute(input.minute);
  const now = new Date().toISOString();
  const task: ManagedTask = {
    id: randomUUID(),
    name,
    prompt,
    schedule: input.schedule,
    timeZone: inferred.timeZone,
    hour: inferred.hour,
    minute: inferred.minute,
    enabled: input.enabled !== false,
    nextRunAt: computeNextRunAt(input.schedule, new Date(), inferred),
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
  patch: Partial<
    Pick<ManagedTask, "name" | "prompt" | "schedule" | "enabled" | "timeZone" | "hour" | "minute">
  >,
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
  if (typeof patch.timeZone === "string") next.timeZone = resolveTaskTimeZone(patch.timeZone);
  if (patch.hour !== undefined) next.hour = clampHour(patch.hour);
  if (patch.minute !== undefined) next.minute = clampMinute(patch.minute);
  if (patch.schedule !== undefined) {
    if (!isTaskSchedulePreset(patch.schedule)) throw new Error("Invalid schedule");
    next.schedule = patch.schedule;
  }
  const scheduleChanged =
    patch.schedule !== undefined ||
    patch.timeZone !== undefined ||
    patch.hour !== undefined ||
    patch.minute !== undefined;
  if (scheduleChanged) {
    next.nextRunAt = computeNextRunAt(next.schedule, new Date(), scheduleOptionsFromTask(next));
  }
  if (typeof patch.enabled === "boolean") {
    next.enabled = patch.enabled;
    if (patch.enabled && !prev.enabled) {
      next.nextRunAt = computeNextRunAt(next.schedule, new Date(), scheduleOptionsFromTask(next));
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
    conversationId?: string;
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
    lastConversationId: result.conversationId ?? prev.lastConversationId,
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
  const claimedNext = computeNextRunAt(prev.schedule, new Date(), scheduleOptionsFromTask(prev));
  store.tasks[idx] = {
    ...prev,
    nextRunAt: claimedNext,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(userId, store);
  return { ...store.tasks[idx]!, nextRunAt: claimedNext };
}

export { MAX_TASKS, MAX_PROMPT, MAX_RESULT };
