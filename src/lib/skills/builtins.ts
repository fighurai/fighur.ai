import { parseSkillMarkdown } from "@/lib/skills/parse";
import type { SkillMeta } from "@/lib/skills/types";

const BUILTIN_RAW: string[] = [
  `---
name: deep-research
description: Use when the user asks for research, competitive analysis, market scans, literature reviews, sourcing facts with citations, or multi-source briefings. Triggers on research, investigate, compare vendors, deep dive, what's happening with.
---
# Deep Research

## Workflow
1. Clarify the research question and desired output format (brief, memo, table, full report).
2. Call **web_search** with several focused queries (not one vague query).
3. Call **fetch_url** on the best 2–5 sources to read primary content.
4. Synthesize with citations (title + URL). Separate facts from inference.
5. End with **Key takeaways**, **Open questions**, and **Sources**.

## Quality
- Prefer primary sources and recent dates.
- Never invent URLs or statistics.
- If tools fail, say what you could not verify.`,

  `---
name: tech-writer
description: Use when writing API docs, READMEs, user guides, tutorials, changelogs, or technical blog posts. Triggers on document, write docs, README, API reference, guide, tutorial.
---
# Technical Writer

## Workflow
1. Identify audience (developer, end user, internal).
2. Outline sections before drafting.
3. Use clear headings, short paragraphs, and working code examples in fenced blocks with language tags.
4. Include prerequisites, steps, and troubleshooting.

## Quality
- Accurate terminology; no filler.
- Examples must be runnable or clearly marked as pseudocode.
- Call out breaking changes and migration notes when relevant.`,

  `---
name: code-reviewer
description: Use when reviewing code, PRs, diffs, security concerns, performance, or architecture feedback. Triggers on review this, code review, PR review, find bugs, security audit, refactor feedback.
---
# Code Reviewer

## Workflow
1. Restate what the change is trying to do.
2. Scan for correctness bugs, edge cases, security (injection, authz, secrets), and performance.
3. Separate **Must fix**, **Should fix**, and **Nits**.
4. Suggest minimal patches in fenced blocks with file paths.

## Quality
- Be specific to the code provided—no generic advice.
- Prefer concrete fixes over abstract principles.
- Do not claim you ran tests unless **run_code** or the user confirms.`,

  `---
name: app-scaffold
description: Use when building web apps, sites, dashboards, APIs, or full-stack MVPs for Canvas. Triggers on build an app, create a website, scaffold, dashboard, landing page, full-stack.
---
# App Scaffold

## Workflow
1. Restate the product in one sentence and list core screens/features.
2. Ship a **multi-file** project with path-labeled fences: \`index.html\`, \`styles.css\`, \`main.js\` (or React/Next structure when asked).
3. Prefer real visual polish: CSS variables, responsive layout, purposeful motion.
4. Include setup/run commands.
5. After the first working version, offer focused iteration steps.

## Tools
- Use **generate_image** for photorealistic hero/product imagery when needed.
- Use **generate_artifact** for exportable project zips manifests (file list + contents) when asked to package.

## Quality
- No placeholder lorem when the user gave real copy.
- Never claim the app is hosted live unless an app deploy tool returned a URL.`,

  `---
name: data-analyst
description: Use for CSV/Excel analysis, metrics, charts plans, cleaning data, summarizing tables, or turning numbers into decisions. Triggers on analyze this data, spreadsheet, CSV, metrics, cohort, funnel, pivot.
---
# Data Analyst

## Workflow
1. Inspect columns, types, missing values, and row counts from the user data.
2. State assumptions before computing.
3. Use **run_code** for calculations, aggregations, and transforms when helpful.
4. Present findings with tables; recommend chart types (do not invent chart images unless generated).
5. End with **Insights**, **Risks/caveats**, and **Next analyses**.

## Quality
- Never invent numbers not present in the data or tool output.
- Mark unreadable fields explicitly.`,

  `---
name: document-expert
description: Use when creating or structuring documents, spreadsheets, decks outlines, PDFs content, memos, proposals, or exportable files. Triggers on write a memo, proposal, spreadsheet, CSV export, slide outline, PDF content, briefing doc.
---
# Document Expert

## Workflow
1. Confirm deliverable type (memo, proposal, CSV, slide outline, checklist).
2. Draft structured content with clear headings.
3. Call **generate_artifact** to emit downloadable markdown, CSV, JSON, or HTML when the user wants a file.
4. Keep a short summary in chat plus the artifact.

## Quality
- Professional tone matching the ask.
- Spreadsheets: real headers and rows, not screenshots of tables only.`,

  `---
name: workflow-builder
description: Use when designing automations, agent workflows, cron/scheduled jobs, Zapier-like flows, or multi-step business processes. Triggers on automate, workflow, schedule, pipeline, orchestration, trigger, webhook.
---
# Workflow Builder

## Workflow
1. Define trigger, steps, systems involved, success criteria, and failure handling.
2. Produce a step diagram in markdown plus implementation notes.
3. Call out required connectors (Gmail, Calendar, Slack, APIs) and secrets.
4. If coding, prefer webhook handlers, job stubs, and idempotent steps.
5. Be honest: FIGHURAI may not yet run cloud cron—design the workflow and say what must be scheduled externally until Tasks ship.

## Quality
- Explicit inputs/outputs per step.
- No fake "task created" claims without a task API result.`,
];

let cache: SkillMeta[] | null = null;

export function listBuiltinSkills(): SkillMeta[] {
  if (cache) return cache;
  const skills: SkillMeta[] = [];
  for (const raw of BUILTIN_RAW) {
    const parsed = parseSkillMarkdown(raw, "builtin", true);
    if ("error" in parsed) {
      console.error("[skills] builtin parse error:", parsed.error);
      continue;
    }
    skills.push(parsed);
  }
  cache = skills;
  return skills;
}

export function getBuiltinSkill(name: string): SkillMeta | null {
  return listBuiltinSkills().find((s) => s.name === name) ?? null;
}
