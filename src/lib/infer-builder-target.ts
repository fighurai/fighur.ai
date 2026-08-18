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
 * Infer build mode from natural language. Priority: workflow → agent → application → general chat.
 */
export function inferSmileBuilderTargetFromPrompt(text: string): SmileBuilderTarget {
  return classifyPromptIntent(text);
}

/**
 * Writing / research deliverables that belong in Workspace as a Document
 * (Claude Artifact markdown / ChatGPT Canvas writing mode) — not an app preview.
 */
export function isDocumentWritingPrompt(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;

  // Real app/site builds win.
  if (
    /\b(website|web\s*app|web\s*site|landing\s*page|dashboard|saas|next\.?js|react\s+app|html\s+page)\b/i.test(
      t,
    ) &&
    /\b(build|create|make|design|code|scaffold|develop)\b/i.test(t)
  ) {
    return false;
  }
  // Explicit code-script requests stay in app/code canvas.
  if (
    /\b(javascript|typescript|python|bash|shell|sql)\b/i.test(t) &&
    /\b(script|code|program|function)\b/i.test(t)
  ) {
    return false;
  }

  // Social / short-form content scripts (Instagram Reels, TikTok, etc.)
  if (
    /\b(reel|reels|tiktok|instagram|ig\b|youtube\s*short|short[\s-]?form|voiceover|voice[\s-]?over|caption|captions|hook)\b/i.test(
      t,
    ) &&
    /\b(write|draft|create|make|script|scripts|talk\s+about|content)\b/i.test(t)
  ) {
    return true;
  }

  const docNoun =
    /\b(research|report|memo|brief|essay|proposal|white\s*paper|article|blog\s*post|screenplay|teleplay|pitch|document|write[\s-]?up|analysis|outline|summary|script|scripts|narrative|story|copy|press\s*release|one[\s-]?pager|reel|reels|caption|captions|voiceover)\b/i.test(
      t,
    );
  const writingVerb =
    /\b(write|draft|create|prepare|produce|compose|generate|research|summarize|outline|author)\b/i.test(
      t,
    );
  return docNoun && writingVerb;
}

/** True when the prompt should open Workspace (app build OR document writing). */
export function promptRequestsBuildWorkspace(text: string): boolean {
  if (isDocumentWritingPrompt(text)) return true;
  const intent = classifyPromptIntent(text);
  if (intent !== "general") return true;
  if (/```[\s\S]+```/.test(text)) return true;
  if (/\b(brochure|flyer|leaflet|pamphlet|poster|handout)\b/i.test(text)) return true;
  if (/\b(edit|modify|change|update|redesign|create|generate|draw|make|improve|better|enhance|polish)\b.*\b(image|photo|picture|logo|icon|banner|graphic|svg|brochure|flyer|design|layout|this|it)\b/i.test(text)) {
    return true;
  }
  return false;
}

function classifyPromptIntent(text: string): SmileBuilderTarget {
  const t = text.toLowerCase().trim();
  if (!t) return "general";

  // Document writing is not an application build.
  if (isDocumentWritingPrompt(text)) return "general";

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
    /\b(build|create|make|design|scaffold|develop|implement|code)\b.*\b(app|application|website|web\s*app|web\s*site|landing\s*page|dashboard|saas|storefront|portal|ui|frontend|full[-\s]?stack|next\.?js|react|vue|svelte|html|tool|page)\b/i.test(
      t,
    ) ||
    /\b(an?\s+application|a\s+website|web\s*app|landing\s*page|next\.?js|react\s+app|dashboard|saas|mobile\s+app|deploy\s+my\s+app|modern\s+(site|page|ui|website))\b/i.test(
      t,
    ) ||
    /\b(intricate|complex|detailed|advanced|sophisticated|interactive|animated|custom|production[\s-]?quality|full[\s-]?site|multi[\s-]?file|agency)\b.*\b(website|site|page|ui|landing)\b/i.test(
      t,
    ) ||
    /\b(make|improve|better|redesign|polish|enhance|upgrade|refine)\b.*\b(brochure|flyer|leaflet|pamphlet|poster|handout|this|design|layout)\b/i.test(
      t,
    ) ||
    // Code/UI script — not screenplay/dialogue "script"
    /\b(write|generate|show|design)\b.*\b(code|html|react|typescript|javascript|ui|website|page|site)\b/i.test(
      t,
    ) ||
    /\b(write|generate)\b.*\b(javascript|typescript|python)\s+script\b/i.test(t);
  if (application) return "application";

  return "general";
}
