import { normalizeWorkMode, type WorkMode } from "@/lib/work-mode";
import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";
import {
  defaultLayoutPrefs,
  normalizeLayoutPrefs,
  type LayoutPrefs,
} from "@/lib/layout-storage";

const FILE = "preferences.json";
const MAX_INSTRUCTIONS = 8_000;

export type UserPreferences = {
  workMode: WorkMode;
  /** Always-on custom instructions (Abacus Customize AI) */
  customInstructions: string;
  /** Optional workspace layout (desktop columns) */
  layout?: LayoutPrefs;
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
      layout: parsed.layout ? normalizeLayoutPrefs(parsed.layout) : undefined,
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
    layout: prefs.layout !== undefined ? normalizeLayoutPrefs(prefs.layout) : existing.layout,
    updatedAt: new Date().toISOString(),
  };
  if (next.layout && JSON.stringify(next.layout) === JSON.stringify(defaultLayoutPrefs())) {
    delete next.layout;
  }
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}
