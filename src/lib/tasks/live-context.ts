import { searchWeb, simplifySearchQuery, type WebSearchHit } from "@/lib/integrations/web-search-api";
import { shouldAutoGroundWeb } from "@/lib/integrations/live-web-context";

const NEWS_HINT_RE =
  /\b(news|latest|today|tonight|headline|briefing|roundup|current events?|breaking|what happened)\b/i;

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

export function newsSearchQuery(prompt: string, monthDayYear: string): string {
  const cleaned = cleanPromptForSearch(prompt);
  const q = simplifySearchQuery(cleaned) || "artificial intelligence news";
  return `${q} ${monthDayYear}`.replace(/\s+/g, " ").trim();
}

function formatHits(hits: WebSearchHit[]): string {
  return hits
    .map((r, i) => {
      const bits = [`${i + 1}. **${r.title}**`];
      if (r.url) bits.push(`   URL: ${r.url}`);
      if (r.snippet) bits.push(`   ${r.snippet.slice(0, 360)}`);
      return bits.join("\n");
    })
    .join("\n\n");
}

/**
 * Fetch live headlines for a scheduled task. Uses a longer budget than chat TTFB.
 */
export async function buildTaskLiveContext(opts: {
  prompt: string;
  monthDayYear: string;
  isoDate: string;
}): Promise<string> {
  if (!taskNeedsLiveWeb(opts.prompt)) return "";

  const primary = newsSearchQuery(opts.prompt, opts.monthDayYear);
  const fallback = newsSearchQuery(opts.prompt, "today");

  const batches = await Promise.allSettled([
    searchWeb(primary, 8),
    primary === fallback ? Promise.resolve(null) : searchWeb(fallback, 6),
  ]);

  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const batch of batches) {
    if (batch.status !== "fulfilled" || !batch.value) {
      if (batch.status === "rejected") {
        errors.push(batch.reason instanceof Error ? batch.reason.message : "search error");
      }
      continue;
    }
    const res = batch.value;
    if (!res.ok) {
      errors.push(res.error);
      continue;
    }
    for (const hit of res.results) {
      const key = (hit.url || hit.title).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
      if (hits.length >= 10) break;
    }
  }

  if (!hits.length) {
    return `

## LIVE WEB SEARCH
Search ran for current headlines (${opts.isoDate}) but returned no usable results${
      errors.length ? ` (${errors.slice(0, 2).join(" · ")})` : ""
    }.
Do NOT invent a dated news briefing or generic industry landscape. Tell the user headlines were unavailable and list what you tried.
`;
  }

  return `

## LIVE WEB SEARCH (fetched just now for ${opts.isoDate})
Use ONLY these headlines for current events. Quote titles accurately. Include source URLs.
Do not invent products, dates, or stories that are not in this list. Do not write a generic "AI landscape" recap.

Query: ${primary}

${formatHits(hits)}
`;
}
