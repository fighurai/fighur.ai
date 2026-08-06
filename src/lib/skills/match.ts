import type { SkillMeta } from "@/lib/skills/types";

const MAX_ACTIVE_SKILLS = 4;

/**
 * Select skills whose descriptions/names match the user message.
 * Optional allowlist restricts to named skills (conversation-level preselect).
 */
export function matchSkills(
  skills: SkillMeta[],
  userText: string,
  allowlist?: string[] | null,
): SkillMeta[] {
  const enabled = skills.filter((s) => s.enabled);
  const pool =
    allowlist && allowlist.length > 0
      ? enabled.filter((s) => allowlist.map((a) => a.toLowerCase()).includes(s.name))
      : enabled;

  if (pool.length === 0) return [];

  // Explicit allowlist → use those (capped)
  if (allowlist && allowlist.length > 0) {
    return pool.slice(0, MAX_ACTIVE_SKILLS);
  }

  const text = userText.toLowerCase();
  const scored = pool
    .map((skill) => ({ skill, score: scoreSkill(skill, text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_ACTIVE_SKILLS).map((x) => x.skill);
}

function scoreSkill(skill: SkillMeta, text: string): number {
  let score = 0;
  const hay = `${skill.name.replace(/-/g, " ")} ${skill.description}`.toLowerCase();

  // Token overlap from description trigger phrases after "Triggers on"
  const triggerMatch = /triggers on[:\s]+(.+)$/i.exec(skill.description);
  const triggerBlob = triggerMatch?.[1] ?? skill.description;
  const phrases = triggerBlob
    .split(/[,;]|triggers on/i)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length >= 3);

  for (const phrase of phrases) {
    if (phrase.length >= 4 && text.includes(phrase)) score += 5;
  }

  // Name tokens
  for (const part of skill.name.split("-")) {
    if (part.length >= 4 && text.includes(part)) score += 3;
  }

  // Keyword hits from description words
  const words = hay
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5);
  const unique = [...new Set(words)].slice(0, 40);
  for (const w of unique) {
    if (text.includes(w)) score += 1;
  }

  return score;
}

/** Format matched skills for the system prompt. */
export function formatSkillsSystemContext(skills: SkillMeta[]): string {
  if (skills.length === 0) return "";

  const blocks = skills.map((s) => {
    return `### Skill: ${s.name}
${s.description}

${s.body}`;
  });

  return `

## Active Agent Skills
The following specialized skills are active for this turn. Follow their workflows when relevant. You may use multiple skills together.

${blocks.join("\n\n---\n\n")}`;
}

/** Compact catalog so the model knows what else is available (not full bodies). */
export function formatSkillsCatalogContext(skills: SkillMeta[]): string {
  const enabled = skills.filter((s) => s.enabled);
  if (enabled.length === 0) return "";
  const lines = enabled.map((s) => `- **${s.name}**: ${s.description.slice(0, 160)}`);
  return `

## Available skills (auto-activated when relevant)
${lines.join("\n")}
Skills activate automatically from the user request. Prefer skill workflows over improvised process when a skill matches.`;
}
