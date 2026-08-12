/**
 * FIGHURAI work modes for chat behavior.
 */

export type WorkMode = "chat" | "cowork" | "codex";

export type WorkModeOption = {
  id: WorkMode;
  label: string;
  tagline: string;
  description: string;
  /** Short ownership label shown in Settings (FIGHURAI only). */
  inspiredBy: string;
};

export const WORK_MODE_OPTIONS: WorkModeOption[] = [
  {
    id: "chat",
    label: "Chat",
    tagline: "Default assistant",
    description:
      "Balanced Q&A, writing, and light building—FIGHURAI’s everyday assistant mode.",
    inspiredBy: "FIGHURAI",
  },
  {
    id: "cowork",
    label: "CoWork",
    tagline: "Knowledge work & deliverables",
    description:
      "Outcome-first: plans, organized files, memos, spreadsheets, and multi-step tasks you can walk away from.",
    inspiredBy: "FIGHURAI",
  },
  {
    id: "codex",
    label: "Codex",
    tagline: "Software engineering agent",
    description:
      "Ship code: multi-file changes, tests, refactors, PR-style reviews, and runnable scaffolds.",
    inspiredBy: "FIGHURAI",
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
