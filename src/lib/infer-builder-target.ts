import type { SmileBuilderTarget } from "@/lib/smile-system-prompt";

/** Plain text from the latest user turn (string or multimodal text blocks). */
export function lastUserMessageText(
  messages: { role: string; content: string | Array<Record<string, unknown>> }[],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const parts: string[] = [];
      for (const block of m.content) {
        if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
          parts.push((block as { text: string }).text);
        }
      }
      const joined = parts.join("\n").trim();
      if (joined) return joined;
    }
  }
  return "";
}

/**
 * Infer build mode from natural language. Priority: workflow → agent → application.
 */
export function inferSmileBuilderTargetFromPrompt(text: string): SmileBuilderTarget {
  const t = text.toLowerCase();

  const workflow =
    /\b(workflow|workflows|automation|automate|zapier|n8n|pipedream|ifttt|webhook|webhooks|cron\b|scheduled job|scheduler|orchestrat|etl\b|pipeline|integrations?\s+flow|event[-\s]?driven)\b/i.test(
      t,
    );
  if (workflow) return "workflow";

  const agent =
    /\b(chatbot|chat\s*bot|conversational\s+(ai|agent)|virtual\s+assistant|customer\s+support\s+bot|slack\s+bot|telegram\s+bot|discord\s+bot|ai\s+agent|multi[-\s]?agent|copilot|dialogue\s+system|intent\s+classification|tool[-\s]?calling\s+agent)\b/i.test(
      t,
    );
  if (agent) return "agent";

  const application =
    /\b(build|create|make|scaffold|develop)\b.*\b(app|application|website|web\s*app|web\s*site|landing\s*page|dashboard|saas|storefront|portal|ui|frontend|full[-\s]?stack|next\.?js|react|vue|svelte)\b/i.test(
      t,
    ) ||
    /\b(an?\s+application|a\s+website|web\s*app|landing\s*page|next\.?js|react\s+app|dashboard|saas|mobile\s+app|deploy\s+my\s+app)\b/i.test(
      t,
    );
  if (application) return "application";

  return "application";
}
