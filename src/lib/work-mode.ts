/**
 * Work modes inspired by Anthropic Claude Cowork and OpenAI Codex.
 * @see docs/WORK_MODES.md
 */

export type WorkMode = "chat" | "cowork" | "codex";

export type WorkModeOption = {
  id: WorkMode;
  label: string;
  tagline: string;
  description: string;
  /** Product this mode is modeled after (attribution, not integration). */
  inspiredBy: string;
};

export const WORK_MODE_OPTIONS: WorkModeOption[] = [
  {
    id: "chat",
    label: "Chat",
    tagline: "Default assistant",
    description:
      "Balanced Q&A, writing, and light building—like a general ChatGPT or Claude chat.",
    inspiredBy: "FIGHURAI default",
  },
  {
    id: "cowork",
    label: "CoWork",
    tagline: "Knowledge work & deliverables",
    description:
      "Outcome-first: plans, organized files, memos, spreadsheets, and multi-step tasks you can walk away from—modeled on Anthropic Claude Cowork.",
    inspiredBy: "Anthropic Claude Cowork",
  },
  {
    id: "codex",
    label: "Codex",
    tagline: "Software engineering agent",
    description:
      "Ship code: multi-file changes, tests, refactors, PR-style reviews, and runnable scaffolds—modeled on OpenAI Codex.",
    inspiredBy: "OpenAI Codex",
  },
];

export function normalizeWorkMode(raw: unknown, legacyCoworkDevice?: boolean): WorkMode {
  if (raw === "cowork" || raw === "codex" || raw === "chat") return raw;
  if (legacyCoworkDevice === true) return "cowork";
  return "chat";
}

export function workModeLabel(mode: WorkMode): string {
  return WORK_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? "Chat";
}
