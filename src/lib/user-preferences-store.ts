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

export type DeepResearchPrefs = {
  /** Prefer deep-research skill and multi-source synthesis in chat. */
  enabled: boolean;
  /** Ask the model to include citations / source links. */
  citeSources: boolean;
  /** Default effort for research-heavy prompts. */
  effort: "auto" | "low" | "high";
};

export type UserPreferences = {
  workMode: WorkMode;
  /**
   * Legacy combined instructions. Kept for backward compatibility;
   * UI splits into behavior + response.
   */
  customInstructions: string;
  /** How the model approaches problems. */
  behaviorInstructions: string;
  /** Tone / format / persona of answers. */
  responseInstructions: string;
  deepResearch: DeepResearchPrefs;
  /** Optional workspace layout (desktop columns) */
  layout?: LayoutPrefs;
  /** User finished or skipped the Quick tutorial (don't show center CTA again). */
  quickTutorialDone?: boolean;
  updatedAt: string;
};

function defaultDeepResearch(): DeepResearchPrefs {
  return { enabled: false, citeSources: true, effort: "auto" };
}

function defaultPreferences(): UserPreferences {
  return {
    workMode: "chat",
    customInstructions: "",
    behaviorInstructions: "",
    responseInstructions: "",
    deepResearch: defaultDeepResearch(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeInstructions(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_INSTRUCTIONS);
}

function normalizeDeepResearch(raw: unknown): DeepResearchPrefs {
  const d = defaultDeepResearch();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Partial<DeepResearchPrefs>;
  return {
    enabled: Boolean(o.enabled),
    citeSources: o.citeSources !== false,
    effort: o.effort === "low" || o.effort === "high" || o.effort === "auto" ? o.effort : "auto",
  };
}

export async function readUserPreferences(userId: string): Promise<UserPreferences> {
  if (!isSafeUserId(userId)) return defaultPreferences();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return defaultPreferences();
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    const customInstructions = normalizeInstructions(parsed.customInstructions);
    let behaviorInstructions = normalizeInstructions(parsed.behaviorInstructions);
    let responseInstructions = normalizeInstructions(parsed.responseInstructions);
    // Migrate legacy single field into behavior if split fields are empty.
    if (!behaviorInstructions && !responseInstructions && customInstructions) {
      behaviorInstructions = customInstructions;
    }
    return {
      workMode: normalizeWorkMode(parsed.workMode),
      customInstructions,
      behaviorInstructions,
      responseInstructions,
      deepResearch: normalizeDeepResearch(parsed.deepResearch),
      layout: parsed.layout ? normalizeLayoutPrefs(parsed.layout) : undefined,
      quickTutorialDone: Boolean(parsed.quickTutorialDone),
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
  const behaviorInstructions =
    prefs.behaviorInstructions !== undefined
      ? normalizeInstructions(prefs.behaviorInstructions)
      : existing.behaviorInstructions;
  const responseInstructions =
    prefs.responseInstructions !== undefined
      ? normalizeInstructions(prefs.responseInstructions)
      : existing.responseInstructions;
  const customInstructions =
    prefs.customInstructions !== undefined
      ? normalizeInstructions(prefs.customInstructions)
      : // Keep legacy field mirrored from the split fields for older readers.
        [behaviorInstructions, responseInstructions].filter(Boolean).join("\n\n");

  const next: UserPreferences = {
    workMode: prefs.workMode !== undefined ? normalizeWorkMode(prefs.workMode) : existing.workMode,
    customInstructions,
    behaviorInstructions,
    responseInstructions,
    deepResearch:
      prefs.deepResearch !== undefined
        ? normalizeDeepResearch(prefs.deepResearch)
        : existing.deepResearch,
    layout: prefs.layout !== undefined ? normalizeLayoutPrefs(prefs.layout) : existing.layout,
    quickTutorialDone:
      prefs.quickTutorialDone !== undefined
        ? Boolean(prefs.quickTutorialDone)
        : existing.quickTutorialDone,
    updatedAt: new Date().toISOString(),
  };
  if (next.layout && JSON.stringify(next.layout) === JSON.stringify(defaultLayoutPrefs())) {
    delete next.layout;
  }
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}
