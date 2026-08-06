import { normalizeWorkMode, type WorkMode } from "@/lib/work-mode";
import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";

const FILE = "preferences.json";
const MAX_INSTRUCTIONS = 8_000;

export type UserPreferences = {
  workMode: WorkMode;
  /** Always-on custom instructions (Abacus Customize AI) */
  customInstructions: string;
  updatedAt: string;
};

function defaultPreferences(): UserPreferences {
  return {
    workMode: "chat",
    customInstructions: "",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeInstructions(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_INSTRUCTIONS);
}

export async function readUserPreferences(userId: string): Promise<UserPreferences> {
  if (!isSafeUserId(userId)) return defaultPreferences();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return defaultPreferences();
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      workMode: normalizeWorkMode(parsed.workMode),
      customInstructions: normalizeInstructions(parsed.customInstructions),
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
    customInstructions:
      prefs.customInstructions !== undefined
        ? normalizeInstructions(prefs.customInstructions)
        : existing.customInstructions,
    updatedAt: new Date().toISOString(),
  };
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}
