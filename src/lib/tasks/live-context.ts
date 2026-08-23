import {
  searchNewsHeadlines,
  searchWeb,
  simplifySearchQuery,
  type WebSearchHit,
} from "@/lib/integrations/web-search-api";
import { shouldAutoGroundWeb } from "@/lib/integrations/live-web-context";

const NEWS_HINT_RE =
  /\b(news|latest|today|tonight|headline|briefing|roundup|current events?|breaking|what happened)\b/i;

const AI_TOPIC_RE =
  /\b(ai|a\.i\.|artificial intelligence|openai|anthropic|gemini|chatgpt|claude|deepmind|llm)\b/i;

export function taskNeedsLiveWeb(prompt: string): boolean {
  return shouldAutoGroundWeb(prompt) || NEWS_HINT_RE.test(prompt);
}

function cleanPromptForSearch(prompt: string): string {
  return prompt
    .replace(/\b(every\s*day|everyday|daily|weekly|hourly)\b/gi, " ")
    .replace(/\b(at\s+)?\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/gi, " ")
    .replace(/\b(creat(?:e|ing)?|start|open|make)\s+(a\s+|and\s+)?(conversation|chat|thread)\b/gi, " ")
    .replace(/\bstarting from today'?s date\b/gi, " ")
    .replace(/\brun now\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Topic only — never append a calendar date (that makes engines hunt for that string). */
export function newsSearchQuery(prompt: string): string {
  const cleaned = cleanPromptForSearch(prompt);
  const q = simplifySearchQuery(cleaned)
    .replace(/\bnews\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q || /^(the\s+)?(latest\s+)?(ai|a\.i\.)$/i.test(q)) {
    return "artificial intelligence";
  }
  return q;
}

function formatHits(hits: WebSearchHit[]): string {
  return hits
    .map((r, i) => {
      const bits = [`${i + 1}. **${r.title}**`];
      if (r.source) bits.push(`   Source: ${r.source}`);
      if (r.published) bits.push(`   Published: ${r.published}`);
      if (r.url) bits.push(`   URL: ${r.url}`);
      if (r.snippet) bits.push(`   ${r.snippet.slice(0, 360)}`);
      return bits.join("\n");
    })
    .join("\n\n");
}

function mergeUnique(hits: WebSearchHit[], extra: WebSearchHit[], limit: number): WebSearchHit[] {
  const seen = new Set(hits.map((h) => (h.url || h.title).toLowerCase().slice(0, 80)));
  const out = [...hits];
  for (const hit of extra) {
    const key = (hit.url || hit.title).toLowerCase().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fetch live headlines for a scheduled task. Uses news RSS (not Wikipedia /
 * dictionary instant answers). Does not put today's calendar date in the query.
 */
export async function buildTaskLiveContext(opts: {
  prompt: string;
  monthDayYear: string;
  isoDate: string;
}): Promise<string> {
  if (!taskNeedsLiveWeb(opts.prompt)) return "";

  const topic = newsSearchQuery(opts.prompt);
  const queries: string[] = [];
  if (AI_TOPIC_RE.test(opts.prompt) || topic === "artificial intelligence") {
    queries.push('OpenAI OR Anthropic OR "Google DeepMind" OR Gemini OR ChatGPT OR Claude');
  }
  queries.push(topic);

  const batches = await Promise.allSettled(
    queries.map((q) => searchNewsHeadlines(q, 10)),
  );

  const hits: WebSearchHit[] = [];
  const errors: string[] = [];
  const usedQueries: string[] = [];

  for (const batch of batches) {
    if (batch.status !== "fulfilled") {
      errors.push(batch.reason instanceof Error ? batch.reason.message : "search error");
      continue;
    }
    const res = batch.value;
    if (!res.ok) {
      errors.push(res.error);
      continue;
    }
    usedQueries.push(res.query);
    hits.splice(0, hits.length, ...mergeUnique(hits, res.results, 14));
  }

  if (!hits.length) {
    const fallback = await searchWeb(`${topic} news`, 8).catch(() => null);
    if (fallback?.ok) {
      hits.push(...fallback.results.filter((h) => !/wikipedia|dictionary|wiktionary/i.test(h.url)));
    }
  }

  if (!hits.length) {
    return `

## LIVE WEB SEARCH
News headline search ran for "${topic}" (recent week, not the calendar string ${opts.isoDate}) but returned no usable results${
      errors.length ? ` (${errors.slice(0, 2).join(" · ")})` : ""
    }.
Do NOT invent a dated news briefing or generic industry landscape. Tell the user headlines were unavailable and list what you tried.
`;
  }

  return `

## LIVE WEB SEARCH (fetched just now; briefing date is ${opts.isoDate} / ${opts.monthDayYear})
These are the latest available headlines from the past several days. Sunday/weekend briefings should still cover Friday–Sunday stories.
Write a full news briefing dated ${opts.monthDayYear}. Use ONLY these headlines. Quote titles accurately and include source URLs.
Do not say there is no news. Do not invent products or dates that are not below. Do not write a generic "AI landscape" recap.

Queries: ${usedQueries.join(" | ") || topic}

${formatHits(hits)}
`;
}
