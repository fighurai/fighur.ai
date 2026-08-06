import {
  deleteGlobalUserFile,
  readGlobalUserFile,
  writeGlobalUserFile,
} from "@/lib/user-file-storage";

export type ScheduledTaskIndexEntry = {
  userId: string;
  taskId: string;
  nextRunAt: string;
};

type ScheduleIndexFile = {
  entries: ScheduledTaskIndexEntry[];
  updatedAt: string;
};

const INDEX_FILE = "scheduled-tasks/index.json";
const MAX_INDEX = 2_000;

async function readIndex(): Promise<ScheduleIndexFile> {
  const raw = await readGlobalUserFile(INDEX_FILE);
  if (!raw) return { entries: [], updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(raw) as ScheduleIndexFile;
    if (!Array.isArray(parsed.entries)) {
      return { entries: [], updatedAt: new Date().toISOString() };
    }
    return {
      entries: parsed.entries.filter(
        (e) =>
          e &&
          typeof e.userId === "string" &&
          typeof e.taskId === "string" &&
          typeof e.nextRunAt === "string",
      ),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { entries: [], updatedAt: new Date().toISOString() };
  }
}

async function writeIndex(file: ScheduleIndexFile): Promise<void> {
  const next: ScheduleIndexFile = {
    entries: file.entries.slice(0, MAX_INDEX),
    updatedAt: new Date().toISOString(),
  };
  if (next.entries.length === 0) {
    await deleteGlobalUserFile(INDEX_FILE);
    return;
  }
  await writeGlobalUserFile(INDEX_FILE, JSON.stringify(next));
}

/** Replace all index rows for a user with the given enabled tasks. */
export async function syncUserScheduleIndex(
  userId: string,
  tasks: Array<{ id: string; enabled: boolean; nextRunAt: string }>,
): Promise<void> {
  const file = await readIndex();
  const others = file.entries.filter((e) => e.userId !== userId);
  const ours = tasks
    .filter((t) => t.enabled && t.nextRunAt)
    .map((t) => ({ userId, taskId: t.id, nextRunAt: t.nextRunAt }));
  await writeIndex({ entries: [...others, ...ours], updatedAt: new Date().toISOString() });
}

export async function listDueScheduleEntries(
  now: Date = new Date(),
  limit = 5,
): Promise<ScheduledTaskIndexEntry[]> {
  const file = await readIndex();
  const nowIso = now.toISOString();
  return file.entries
    .filter((e) => e.nextRunAt <= nowIso)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
    .slice(0, limit);
}

export async function upsertScheduleEntry(entry: ScheduledTaskIndexEntry): Promise<void> {
  const file = await readIndex();
  const rest = file.entries.filter(
    (e) => !(e.userId === entry.userId && e.taskId === entry.taskId),
  );
  rest.push(entry);
  await writeIndex({ entries: rest, updatedAt: new Date().toISOString() });
}

export async function removeScheduleEntry(userId: string, taskId: string): Promise<void> {
  const file = await readIndex();
  await writeIndex({
    entries: file.entries.filter((e) => !(e.userId === userId && e.taskId === taskId)),
    updatedAt: new Date().toISOString(),
  });
}
