import {
  CHAT_MODEL_OPTIONS,
  getChatModelById,
  resolveChatModelOption,
  type ChatModelOption,
} from "@/lib/chat-models";
import { FREE_TIER_MODEL_ID } from "@/lib/plan-access";

/** Synthetic model id — automatic provider selection. */
export const AUTO_MODEL_ID = "auto";

export type RouteBucket = "coding" | "research" | "creative" | "cheap-fast" | "chat";

export function isAutoModelId(id: string | undefined | null): boolean {
  return (id ?? "").trim().toLowerCase() === AUTO_MODEL_ID;
}

/**
 * Preference lists per bucket (first available + plan-allowed wins).
 * Override via env: SMILE_ROUTE_CODING, SMILE_ROUTE_RESEARCH, etc. (comma-separated ids).
 */
const DEFAULT_PREFS: Record<RouteBucket, string[]> = {
  coding: ["anthropic:claude-sonnet-4-5-20250929"],
  research: ["anthropic:claude-sonnet-4-5-20250929"],
  creative: ["anthropic:claude-sonnet-4-5-20250929"],
  "cheap-fast": ["anthropic:claude-sonnet-4-5-20250929"],
  chat: ["anthropic:claude-sonnet-4-5-20250929"],
};

function prefsForBucket(bucket: RouteBucket): string[] {
  const envKey = `SMILE_ROUTE_${bucket.replace("-", "_").toUpperCase()}`;
  const raw = process.env[envKey]?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // also try RESEARCH style with hyphen normalized
  const alt =
    process.env[`SMILE_ROUTE_${bucket.toUpperCase().replace(/-/g, "_")}`]?.trim() ||
    process.env[`SMILE_ROUTE_${bucket.toUpperCase()}`]?.trim();
  if (alt) {
    return alt
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_PREFS[bucket];
}

/** Rules-based classifier — no extra LLM call (RouteLLM-style heuristics). */
export function classifyRouteBucket(userText: string): RouteBucket {
  const t = userText.trim();
  if (!t) return "chat";

  if (
    t.length < 48 &&
    /^(hi|hello|hey|thanks|thank you|ok|okay|yo|sup|good (morning|afternoon|evening)|how are you)[\s!.]*$/i.test(
      t,
    )
  ) {
    return "cheap-fast";
  }

  const hasCodeFence = /```/.test(t);
  const coding =
    hasCodeFence ||
    /\b(function|const |let |import |export |class |def |async |await |typescript|javascript|python|react|next\.?js|debug|stack trace|refactor|compile|typescript|css|html|api route|pull request|unit test|bugfix|implement|scaffold)\b/i.test(
      t,
    ) ||
    /\b(build|create|make)\b.{0,40}\b(app|site|page|component|api|script)\b/i.test(t);

  if (coding) return "coding";

  const research =
    /\b(news|latest|today|tonight|right now|currently|weather|forecast|price|stock|score|who is|who'?s|president|prime minister|happened|breaking|headline|search for|look up|research|sources?|cite|as of)\b/i.test(
      t,
    );
  if (research) return "research";

  const creative =
    /\b(poem|story|screenplay|lyrics|brainstorm|tagline|slogan|marketing copy|rewrite creatively|fiction|novel|character)\b/i.test(
      t,
    ) || /\b(write|draft)\b.{0,30}\b(blog|newsletter|ad|caption|script)\b/i.test(t);
  if (creative) return "creative";

  if (t.length < 80 && !/[?]/.test(t) && !/\b(please|help|explain|how|why|what)\b/i.test(t)) {
    return "cheap-fast";
  }

  return "chat";
}

/**
 * Pick the first preference that is both in the plan allowlist and has a configured API key.
 */
export function resolveAutoChatModel(
  userText: string,
  allowedIds: string[],
): { option: ChatModelOption; bucket: RouteBucket } | null {
  const bucket = classifyRouteBucket(userText);
  const allowed = new Set(allowedIds);
  const prefs = [
    ...prefsForBucket(bucket),
    FREE_TIER_MODEL_ID,
    ...CHAT_MODEL_OPTIONS.map((m) => m.id),
  ];

  const seen = new Set<string>();
  for (const id of prefs) {
    if (seen.has(id) || !allowed.has(id)) continue;
    seen.add(id);
    const option = resolveChatModelOption(id);
    if (option) return { option, bucket };
  }

  // Last resort: any allowed configured model
  for (const id of allowedIds) {
    const option = resolveChatModelOption(id);
    if (option) return { option, bucket };
  }

  const fallback = getChatModelById(FREE_TIER_MODEL_ID);
  if (fallback) {
    const option = resolveChatModelOption(FREE_TIER_MODEL_ID);
    if (option) return { option, bucket };
  }

  return null;
}

export function routeBucketLabel(bucket: RouteBucket): string {
  switch (bucket) {
    case "coding":
      return "coding";
    case "research":
      return "research";
    case "creative":
      return "creative";
    case "cheap-fast":
      return "quick";
    default:
      return "chat";
  }
}
