import { isSafeUserId } from "@/lib/user-data-store";
import { readUserFile, writeUserFile } from "@/lib/user-file-storage";
import type { UserSkillPrefs } from "@/lib/skills/types";

const FILE = "skills.json";

function defaultPrefs(): UserSkillPrefs {
  return {
    disabledBuiltins: [],
    custom: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function readUserSkillPrefs(userId: string | null | undefined): Promise<UserSkillPrefs> {
  if (!userId || !isSafeUserId(userId)) return defaultPrefs();
  const raw = await readUserFile(userId, FILE);
  if (!raw) return defaultPrefs();
  try {
    const parsed = JSON.parse(raw) as Partial<UserSkillPrefs>;
    return {
      disabledBuiltins: Array.isArray(parsed.disabledBuiltins)
        ? parsed.disabledBuiltins.filter((x): x is string => typeof x === "string")
        : [],
      custom: Array.isArray(parsed.custom)
        ? parsed.custom
            .filter(
              (c): c is UserSkillPrefs["custom"][number] =>
                Boolean(c) &&
                typeof c === "object" &&
                typeof (c as { name?: unknown }).name === "string" &&
                typeof (c as { description?: unknown }).description === "string" &&
                typeof (c as { body?: unknown }).body === "string",
            )
            .map((c) => ({
              name: c.name.trim().toLowerCase(),
              description: c.description,
              body: c.body,
              argumentHint: typeof c.argumentHint === "string" ? c.argumentHint : undefined,
              enabled: c.enabled !== false,
            }))
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return defaultPrefs();
  }
}

export async function writeUserSkillPrefs(
  userId: string,
  prefs: UserSkillPrefs,
): Promise<UserSkillPrefs> {
  if (!isSafeUserId(userId)) throw new Error("Invalid user");
  const next: UserSkillPrefs = {
    ...prefs,
    updatedAt: new Date().toISOString(),
  };
  await writeUserFile(userId, FILE, JSON.stringify(next));
  return next;
}
