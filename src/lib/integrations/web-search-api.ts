export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResult =
  | { ok: true; query: string; provider: string; results: WebSearchHit[] }
  | { ok: false; error: string };

function braveKey(): string | null {
  const k = process.env.BRAVE_SEARCH_API_KEY?.trim() || process.env.SMILE_BRAVE_SEARCH_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function tavilyKey(): string | null {
  const k = process.env.TAVILY_API_KEY?.trim() || process.env.SMILE_TAVILY_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

export function isWebSearchConfigured(): boolean {
  return Boolean(braveKey() || tavilyKey());
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}

function stripTags(input: string): string {
  // Decode entities first so &lt;a&gt; becomes real tags, then strip.
  let s = decodeHtmlEntities(input);
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeHtmlEntities(s);
  return s.replace(/\s+/g, " ").trim();
}

/** Strip question filler so Wikipedia/news queries hit better. */
export function simplifySearchQuery(query: string): string {
  return query
    .replace(
      /^(hey\s+)?(please\s+)?(can you\s+|could you\s+)?(tell me\s+|search( for)?\s+|look up\s+|find\s+|what(?:'s| is| are)\s+|who(?:'s| is| are)\s+|when(?:'s| is| are)\s+|where(?:'s| is| are)\s+|why(?:'s| is| are)\s+|how(?:'s| is| are| do| does| did)\s+|latest\s+on\s+|news about\s+)/i,
      "",
    )
    .replace(/\b(right now|currently|these days|as of today|today|tonight)\b/gi, " ")
    .replace(/\?+$/g, "")
    .replace(/\s+/g, " ")
    .trim() || query.trim();
}

async function searchBrave(query: string, maxResults: number): Promise<WebSearchResult> {
  const key = braveKey();
  if (!key) return { ok: false, error: "Brave key missing" };

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(maxResults, 10)));

  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return { ok: false, error: `Brave search failed (${res.status})` };

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const results: WebSearchHit[] =
    data.web?.results?.slice(0, maxResults).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.description ?? "",
    })) ?? [];
  if (!results.length) return { ok: false, error: "Brave returned no results" };
  return { ok: true, query, provider: "brave", results };
}

async function searchTavily(query: string, maxResults: number): Promise<WebSearchResult> {
  const key = tavilyKey();
  if (!key) return { ok: false, error: "Tavily key missing" };

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: Math.min(maxResults, 10),
      include_answer: false,
      search_depth: "basic",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, error: `Tavily search failed (${res.status})` };

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const results: WebSearchHit[] =
    data.results?.slice(0, maxResults).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.content ?? "",
    })) ?? [];
  if (!results.length) return { ok: false, error: "Tavily returned no results" };
  return { ok: true, query, provider: "tavily", results };
}

function parseRssItems(xml: string, maxResults: number): WebSearchHit[] {
  const results: WebSearchHit[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(xml)) !== null && results.length < maxResults) {
    const block = itemMatch[1] ?? "";
    const title = stripTags(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? "");
    const link = stripTags(/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] ?? "");
    const desc = stripTags(
      /<description>([\s\S]*?)<\/description>/i.exec(block)?.[1] ?? "",
    ).slice(0, 400);
    if (!title) continue;
    results.push({ title, url: link.startsWith("http") ? link : "", snippet: desc });
  }
  return results;
}

async function searchGoogleNewsRss(query: string, maxResults: number): Promise<WebSearchResult> {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");

  const res = await fetch(url, {
    headers: { "User-Agent": "FIGHURAI/1.0 (+https://fighur.ai)", Accept: "application/rss+xml,application/xml,text/xml,*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return { ok: false, error: `Google News RSS failed (${res.status})` };
  const xml = await res.text();
  const results = parseRssItems(xml, maxResults);
  if (!results.length) return { ok: false, error: "Google News RSS returned no items" };
  return { ok: true, query, provider: "google_news_rss", results };
}

async function searchBingNewsRss(query: string, maxResults: number): Promise<WebSearchResult> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FIGHURAI/1.0; +https://fighur.ai) AppleWebKit/537.36",
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return { ok: false, error: `Bing News RSS failed (${res.status})` };
  const xml = await res.text();
  const results = parseRssItems(xml, maxResults);
  if (!results.length) return { ok: false, error: "Bing News RSS returned no items" };
  return { ok: true, query, provider: "bing_news_rss", results };
}

/** Bing web SERP as RSS — works from datacenter IPs where HTML scrapers get captchas. */
async function searchBingWebRss(query: string, maxResults: number): Promise<WebSearchResult> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("setlang", "en-US");

  const res = await fetch(url, {
    headers: {
      "User-Agent": "FIGHURAI/1.0 (+https://fighur.ai)",
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return { ok: false, error: `Bing web RSS failed (${res.status})` };
  const xml = await res.text();
  const results = parseRssItems(xml, maxResults).filter((r) => {
    // Drop channel chrome / empty junk
    if (!r.title || /^bing:/i.test(r.title)) return false;
    if (r.title.toLowerCase() === query.toLowerCase() && !r.url && !r.snippet) return false;
    return Boolean(r.url || r.snippet.length > 20);
  });
  if (!results.length) return { ok: false, error: "Bing web RSS returned no items" };
  return { ok: true, query, provider: "bing_web_rss", results };
}

async function searchDuckDuckGoInstant(query: string): Promise<WebSearchResult> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: { "User-Agent": "FIGHURAI/1.0 (+https://fighur.ai)" },
  });
  if (!res.ok) return { ok: false, error: `DuckDuckGo Instant failed (${res.status})` };

  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    Answer?: string;
    Definition?: string;
    DefinitionURL?: string;
    RelatedTopics?: Array<
      | { Text?: string; FirstURL?: string }
      | { Topics?: Array<{ Text?: string; FirstURL?: string }> }
    >;
  };

  const results: WebSearchHit[] = [];
  if (data.AbstractText?.trim()) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL ?? "",
      snippet: data.AbstractText,
    });
  }
  if (data.Answer?.trim()) {
    results.push({ title: `Answer: ${query}`, url: "", snippet: data.Answer });
  }
  if (data.Definition?.trim()) {
    results.push({
      title: `Definition: ${query}`,
      url: data.DefinitionURL ?? "",
      snippet: data.Definition,
    });
  }
  for (const topic of data.RelatedTopics ?? []) {
    if ("Topics" in topic && Array.isArray(topic.Topics)) {
      for (const sub of topic.Topics) {
        if (sub.Text && results.length < 8) {
          results.push({
            title: sub.Text.slice(0, 80),
            url: sub.FirstURL ?? "",
            snippet: sub.Text,
          });
        }
      }
    } else if ("Text" in topic && topic.Text && results.length < 8) {
      results.push({
        title: topic.Text.slice(0, 80),
        url: topic.FirstURL ?? "",
        snippet: topic.Text,
      });
    }
  }
  if (!results.length) return { ok: false, error: "DuckDuckGo Instant returned nothing" };
  return { ok: true, query, provider: "duckduckgo_instant", results };
}

async function searchDuckDuckGoHtml(query: string, maxResults: number): Promise<WebSearchResult> {
  const tryOnce = async (method: "GET" | "POST"): Promise<WebSearchResult> => {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    };
    let res: Response;
    if (method === "GET") {
      const url = new URL("https://html.duckduckgo.com/html/");
      url.searchParams.set("q", query);
      res = await fetch(url, {
        headers,
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
    } else {
      res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: "https://duckduckgo.com/",
        },
        body: new URLSearchParams({ q: query }).toString(),
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
      });
    }

    if (!res.ok && res.status !== 202) {
      return { ok: false, error: `DuckDuckGo HTML ${method} failed (${res.status})` };
    }
    const html = await res.text();
    if (/anomaly|captcha|challenge/i.test(html) && !html.includes("result__a")) {
      return { ok: false, error: `DuckDuckGo HTML ${method} challenged (${res.status})` };
    }

    const results: WebSearchHit[] = [];
    const blockRe =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)> )?/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRe.exec(html)) !== null && results.length < maxResults) {
      let href = decodeHtmlEntities(match[1] ?? "");
      try {
        const parsed = new URL(href.startsWith("//") ? `https:${href}` : href);
        const uddg = parsed.searchParams.get("uddg");
        if (uddg) href = decodeURIComponent(uddg);
      } catch {
        /* keep */
      }
      if (!/^https?:\/\//i.test(href)) continue;
      results.push({
        title: stripTags(match[2] ?? "") || href,
        url: href,
        snippet: stripTags(match[3] ?? ""),
      });
    }
    if (!results.length) {
      return { ok: false, error: `DuckDuckGo HTML ${method} returned no parseable results` };
    }
    return { ok: true, query, provider: `duckduckgo_html_${method.toLowerCase()}`, results };
  };

  const get = await tryOnce("GET");
  if (get.ok) return get;
  return tryOnce("POST");
}

const WIKI_UA = "FIGHURAI/1.0 (+https://fighur.ai)";

function wikiTitleTokens(query: string): string[] {
  return simplifySearchQuery(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "who", "what", "when", "where", "why", "how"].includes(t));
}

/** Prefer titles that share distinctive query tokens (France ≫ Princeton). */
function titleRelevance(query: string, title: string): number {
  const tokens = wikiTitleTokens(query);
  if (!tokens.length) return 0;
  const t = title.toLowerCase();
  let hit = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) hit += 1;
  }
  return (hit / tokens.length) * 10;
}

function cleanWikiSnippet(html: string): string {
  return stripTags(html).slice(0, 500);
}

async function enrichWikipediaPage(title: string): Promise<{ snippet: string; url: string } | null> {
  const headers = { Accept: "application/json", "User-Agent": WIKI_UA };
  const enc = encodeURIComponent(title.replace(/ /g, "_"));

  let snippet = "";
  let url = `https://en.wikipedia.org/wiki/${enc}`;

  try {
    const sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (sumRes.ok) {
      const sum = (await sumRes.json()) as {
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      if (sum.extract) snippet = sum.extract.slice(0, 500);
      if (sum.content_urls?.desktop?.page) url = sum.content_urls.desktop.page;
    }
  } catch {
    /* continue */
  }

  // Office pages often name the incumbent only in the infobox, not the lead.
  try {
    const parseUrl = new URL("https://en.wikipedia.org/w/api.php");
    parseUrl.searchParams.set("action", "parse");
    parseUrl.searchParams.set("page", title);
    parseUrl.searchParams.set("prop", "wikitext");
    parseUrl.searchParams.set("format", "json");
    parseUrl.searchParams.set("formatversion", "2");
    const parseRes = await fetch(parseUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (parseRes.ok) {
      const parsed = (await parseRes.json()) as { parse?: { wikitext?: string } };
      const wt = parsed.parse?.wikitext ?? "";
      const incumbent = /\| *incumbent *= *([^\n|]+)/i.exec(wt)?.[1]?.trim();
      if (incumbent) {
        const name = incumbent
          .replace(/\[\[([^|\]]*\|)?([^\]]+)\]\]/g, "$2")
          .replace(/\{\{[^}]+\}\}/g, "")
          .trim();
        if (name) {
          const since = /\| *incumbentsince *= *([^\n|]+)/i.exec(wt)?.[1]?.trim();
          const line = since
            ? `Current incumbent: ${name} (since ${since.replace(/[\[\]]/g, "")}).`
            : `Current incumbent: ${name}.`;
          snippet = snippet ? `${line} ${snippet}` : line;
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (!snippet) return null;
  return { snippet, url };
}

async function searchWikipedia(query: string, maxResults: number): Promise<WebSearchResult> {
  const q = simplifySearchQuery(query);
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", q);
  url.searchParams.set("srlimit", String(Math.min(maxResults, 8)));
  url.searchParams.set("srprop", "snippet|titlesnippet");
  url.searchParams.set("format", "json");

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": WIKI_UA },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, error: `Wikipedia search failed (${res.status})` };

  const data = (await res.json()) as {
    query?: { search?: Array<{ title: string; snippet?: string }> };
  };
  const raw = data.query?.search ?? [];
  if (!raw.length) return { ok: false, error: "Wikipedia returned no results" };

  // Rank by title relevance before enriching
  const ranked = [...raw].sort(
    (a, b) => titleRelevance(q, b.title) - titleRelevance(q, a.title),
  );

  const results: WebSearchHit[] = ranked.map((row) => ({
    title: row.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
    snippet: cleanWikiSnippet(row.snippet ?? ""),
  }));

  // Enrich top 2 pages (summary + incumbent) so "who is the president of X" works
  await Promise.all(
    results.slice(0, 2).map(async (hit, i) => {
      const enriched = await enrichWikipediaPage(ranked[i]!.title);
      if (!enriched) return;
      hit.snippet = enriched.snippet;
      hit.url = enriched.url;
    }),
  );

  return { ok: true, query: q, provider: "wikipedia", results };
}

function mergeResults(
  query: string,
  batches: WebSearchResult[],
  maxResults: number,
): WebSearchResult {
  type Scored = WebSearchHit & { score: number; provider: string };
  const scored: Scored[] = [];
  const providers: string[] = [];

  for (const batch of batches) {
    if (!batch.ok) continue;
    providers.push(batch.provider);
    const wantsNews = /\b(news|latest|breaking|headline|today'?s)\b/i.test(query);
    for (const hit of batch.results) {
      let score = 1 + titleRelevance(query, hit.title);
      if (hit.snippet && hit.snippet.length > 40) score += 3;
      if (/current incumbent/i.test(hit.snippet)) score += 8;
      if (/wikipedia\.org/i.test(hit.url)) score += wantsNews ? 1 : 5;
      if (batch.provider.includes("instant")) score += 4;
      if (batch.provider.includes("wikipedia")) score += wantsNews ? 1 : 4;
      if (batch.provider.includes("brave") || batch.provider.includes("tavily")) score += 6;
      if (batch.provider.includes("bing_web")) score += 5;
      if (batch.provider.includes("news") || batch.provider.includes("rss")) {
        score += wantsNews ? 6 : batch.provider.includes("bing_web") ? 2 : -1;
      }
      if (/news\.google\.com|bing\.com\/news/i.test(hit.url)) score += wantsNews ? 2 : -1;
      // Penalize tangential "President of Princeton"-style misses
      if (titleRelevance(query, hit.title) < 3 && /wikipedia\.org/i.test(hit.url)) score -= 4;
      scored.push({ ...hit, score, provider: batch.provider });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const merged: WebSearchHit[] = [];
  for (const hit of scored) {
    const key = (hit.url || hit.title).toLowerCase();
    if (!key || seen.has(key)) continue;
    // Drop obvious off-topic chrome/extension spam that Bing sometimes returns for rare names
    if (
      /\b(download and install google chrome|chrome web store|crx file)\b/i.test(
        `${hit.title} ${hit.snippet}`,
      ) &&
      !/\bchrome\b/i.test(query)
    ) {
      continue;
    }
    seen.add(key);
    merged.push({ title: hit.title, url: hit.url, snippet: hit.snippet });
    if (merged.length >= maxResults) break;
  }

  // Person-like queries: only keep hits that share distinctive name tokens
  const personLike = looksLikePersonQuery(query);
  const relevant = personLike
    ? merged.filter(
        (h) =>
          titleRelevance(query, h.title) >= 3 ||
          titleRelevance(query, h.snippet) >= 3 ||
          titleRelevance(query, h.url) >= 3,
      )
    : merged;

  if (!relevant.length) {
    const errors = batches.filter((b) => !b.ok).map((b) => (!b.ok ? b.error : ""));
    const allEmpty =
      !batches.some((b) => b.ok) &&
      errors.every(
        (e) =>
          /no (results|items|parseable)|returned nothing|returned no/i.test(e) ||
          /missing/i.test(e),
      );
    const anyNetwork = errors.some((e) =>
      /failed \(\d+\)|timeout|fetch|ENOTFOUND|ECONN|challenged|AbortError/i.test(e),
    );

    // Empty indexed coverage ≠ outage. Tell the model clearly so it doesn't invent
    // "search systems are down" for obscure personal names.
    if (personLike || allEmpty || !anyNetwork || batches.some((b) => b.ok)) {
      return {
        ok: true,
        query,
        provider: "no_indexed_results",
        results: [],
      };
    }

    return {
      ok: false,
      error: `Web search providers failed (${errors.slice(0, 4).join(" · ")}). Retry with a simpler query, or set BRAVE_SEARCH_API_KEY / TAVILY_API_KEY.`,
    };
  }

  return {
    ok: true,
    query,
    provider: providers.join("+") || "merged",
    results: relevant.slice(0, maxResults),
  };
}

function looksLikePersonQuery(query: string): boolean {
  const words = simplifySearchQuery(query)
    .replace(/^(who is|who's|who are)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w));
}

/**
 * Search the public web. Uses paid keys when present, otherwise fans out across
 * keyless providers (Bing web RSS, Wikipedia, Google/Bing News, DuckDuckGo Instant).
 */
export async function searchWeb(query: string, maxResults = 6): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: "query is required" };
  const max = Math.min(10, Math.max(1, maxResults));
  const simplified = simplifySearchQuery(q);
  const primary = simplified || q;

  // Race paid + free together — never block free providers behind a slow/broken key.
  const settled = await Promise.allSettled([
    braveKey() ? searchBrave(q, max) : Promise.resolve({ ok: false, error: "Brave key missing" } as WebSearchResult),
    tavilyKey() ? searchTavily(q, max) : Promise.resolve({ ok: false, error: "Tavily key missing" } as WebSearchResult),
    searchBingWebRss(primary, max),
    searchWikipedia(primary, max),
    searchDuckDuckGoInstant(q),
    searchDuckDuckGoInstant(primary),
    searchGoogleNewsRss(primary, max),
    searchBingNewsRss(primary, max),
    // HTML often captcha'd from datacenters — keep as last-resort only
    searchDuckDuckGoHtml(primary, max),
  ]);

  const batches = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : ({
          ok: false,
          error: s.reason instanceof Error ? s.reason.message : "provider error",
        } as WebSearchResult),
  );

  // Prefer a strong single paid hit when it succeeded
  const braveHit = batches.find((b) => b.ok && b.provider === "brave");
  if (braveHit?.ok && braveHit.results.length >= Math.min(3, max)) return braveHit;
  const tavilyHit = batches.find((b) => b.ok && b.provider === "tavily");
  if (tavilyHit?.ok && tavilyHit.results.length >= Math.min(3, max)) return tavilyHit;

  return mergeResults(q, batches, max);
}

/** Lightweight probe for ops /settings diagnostics. */
export async function probeWebSearchProviders(): Promise<
  Array<{ provider: string; ok: boolean; detail: string }>
> {
  const q = "Apple";
  const checks = await Promise.allSettled([
    searchWikipedia(q, 2),
    searchBingWebRss(q, 2),
    searchGoogleNewsRss(q, 2),
    searchDuckDuckGoInstant(q),
    braveKey()
      ? searchBrave(q, 2)
      : Promise.resolve({ ok: false, error: "not configured" } as WebSearchResult),
    tavilyKey()
      ? searchTavily(q, 2)
      : Promise.resolve({ ok: false, error: "not configured" } as WebSearchResult),
  ]);
  return checks.map((s, i) => {
    const names = ["wikipedia", "bing_web_rss", "google_news_rss", "duckduckgo_instant", "brave", "tavily"];
    if (s.status !== "fulfilled") {
      return {
        provider: names[i]!,
        ok: false,
        detail: s.reason instanceof Error ? s.reason.message : "error",
      };
    }
    const r = s.value;
    return {
      provider: names[i]!,
      ok: r.ok,
      detail: r.ok ? `${r.results.length} hits` : r.error,
    };
  });
}
