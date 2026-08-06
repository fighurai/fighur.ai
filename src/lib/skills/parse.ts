import type { SkillMeta, SkillSource } from "@/lib/skills/types";

/**
 * Parse a SKILL.md (or .md) file with optional YAML frontmatter.
 * Required keys: name, description.
 */
export function parseSkillMarkdown(
  raw: string,
  source: SkillSource,
  enabled = true,
): SkillMeta | { error: string } {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return { error: "Empty skill file" };

  let frontmatter: Record<string, string> = {};
  let body = text;

  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end === -1) return { error: "Unclosed YAML frontmatter" };
    const yamlBlock = text.slice(3, end).trim();
    body = text.slice(end + 4).replace(/^\n+/, "");
    frontmatter = parseSimpleYaml(yamlBlock);
  }

  const name = (frontmatter.name || "").trim().toLowerCase();
  const description = (frontmatter.description || "").trim();
  if (!name) return { error: "Missing required frontmatter field: name" };
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    return { error: "Invalid name: use lowercase letters, numbers, hyphens (max 64)" };
  }
  if (!description) return { error: "Missing required frontmatter field: description" };
  if (description.length > 1024) return { error: "description too long (max 1024)" };
  if (!body.trim()) return { error: "Skill body is empty" };

  return {
    name,
    description,
    source,
    body: body.trim(),
    argumentHint: frontmatter["argument-hint"]?.trim() || frontmatter.argumentHint?.trim(),
    enabled,
  };
}

/** Minimal YAML subset: key: value lines (quoted or plain). */
function parseSimpleYaml(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Serialize a skill back to SKILL.md for export. */
export function serializeSkillMarkdown(skill: SkillMeta): string {
  const lines = [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
  ];
  if (skill.argumentHint) {
    lines.push(`argument-hint: ${JSON.stringify(skill.argumentHint)}`);
  }
  lines.push("---", "", skill.body, "");
  return lines.join("\n");
}
