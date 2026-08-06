import { listBuiltinSkills } from "@/lib/skills/builtins";
import { readUserSkillPrefs } from "@/lib/skills/store";
import type { SkillIndexEntry, SkillMeta } from "@/lib/skills/types";

/** Resolve all skills for a user (builtins + custom), applying enable toggles. */
export async function resolveUserSkills(userId: string | null | undefined): Promise<SkillMeta[]> {
  const prefs = await readUserSkillPrefs(userId);
  const disabled = new Set(prefs.disabledBuiltins.map((n) => n.toLowerCase()));

  const builtins = listBuiltinSkills().map((s) => ({
    ...s,
    enabled: !disabled.has(s.name),
  }));

  const custom: SkillMeta[] = prefs.custom.map((c) => ({
    name: c.name,
    description: c.description,
    source: "custom" as const,
    body: c.body,
    argumentHint: c.argumentHint,
    enabled: c.enabled,
  }));

  // Custom overrides builtin with same name
  const byName = new Map<string, SkillMeta>();
  for (const s of builtins) byName.set(s.name, s);
  for (const s of custom) byName.set(s.name, s);
  return [...byName.values()];
}

export async function listSkillIndex(userId: string | null | undefined): Promise<SkillIndexEntry[]> {
  const skills = await resolveUserSkills(userId);
  return skills.map((s) => ({
    name: s.name,
    description: s.description,
    source: s.source,
    enabled: s.enabled,
  }));
}

export function getEnabledSkills(skills: SkillMeta[]): SkillMeta[] {
  return skills.filter((s) => s.enabled);
}
