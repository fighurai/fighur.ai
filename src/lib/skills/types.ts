/** Agent Skills — Abacus-compatible SKILL.md packs (agentskills.io-style). */

export type SkillSource = "builtin" | "custom";

export type SkillMeta = {
  /** Lowercase hyphenated id, e.g. deep-research */
  name: string;
  /** Trigger-oriented description — used for auto-matching */
  description: string;
  source: SkillSource;
  /** Full markdown body after frontmatter */
  body: string;
  /** Optional argument hint */
  argumentHint?: string;
  enabled: boolean;
};

export type SkillIndexEntry = {
  name: string;
  description: string;
  source: SkillSource;
  enabled: boolean;
};

export type UserSkillPrefs = {
  /** Disabled builtin names */
  disabledBuiltins: string[];
  /** Custom skills uploaded by the user */
  custom: Array<{
    name: string;
    description: string;
    body: string;
    argumentHint?: string;
    enabled: boolean;
  }>;
  /** Optional per-conversation allowlist override (names). Empty = use all enabled. */
  updatedAt: string;
};
