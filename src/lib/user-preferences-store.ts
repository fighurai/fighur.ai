import { normalizeWorkMode, type WorkMode } from "@/lib/work-mode";
import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

const FILE = "preferences.json";

export type UserPreferences = {
  workMode: WorkMode;
  updatedAt: string;
};

function defaultPreferences(): UserPreferences {
  return { workMode: "chat", updatedAt: new Date().toISOString() };
}

export async function readUserPreferences(userId: string): Promise<UserPreferences> {
  if (!isSafeUserId(userId)) return defaultPreferences();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return defaultPreferences();
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      workMode: normalizeWorkMode(parsed.workMode),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultPreferences();
  }
}

export async function writeUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>,
): Promise<UserPreferences> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const existing = await readUserPreferences(userId);
  const next: UserPreferences = {
    workMode: prefs.workMode !== undefined ? normalizeWorkMode(prefs.workMode) : existing.workMode,
    updatedAt: new Date().toISOString(),
  };
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}
