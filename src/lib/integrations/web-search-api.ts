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

async function searchBrave(query: string, maxResults: number): Promise<WebSearchResult> {
  const key = braveKey();
  if (!key) return { ok: false, error: "Brave key missing" };

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(maxResults, 10)));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, error: `Brave search failed (${res.status})` };
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  const results: WebSearchHit[] =
    data.web?.results?.slice(0, maxResults).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.description ?? "",
    })) ?? [];

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
  });

  if (!res.ok) {
    return { ok: false, error: `Tavily search failed (${res.status})` };
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  const results: WebSearchHit[] =
    data.results?.slice(0, maxResults).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: r.content ?? "",
    })) ?? [];

  return { ok: true, query, provider: "tavily", results };
}

/** DuckDuckGo Instant Answer — limited fallback, no API key. */
async function searchDuckDuckGoInstant(query: string): Promise<WebSearchResult> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { ok: false, error: `DuckDuckGo failed (${res.status})` };

  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string } | { Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
  };

  const results: WebSearchHit[] = [];
  if (data.AbstractText?.trim()) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL ?? "",
      snippet: data.AbstractText,
    });
  }

  for (const topic of data.RelatedTopics ?? []) {
    if ("Topics" in topic && Array.isArray(topic.Topics)) {
      for (const sub of topic.Topics) {
        if (sub.Text && results.length < 8) {
          results.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL ?? "", snippet: sub.Text });
        }
      }
    } else if ("Text" in topic && topic.Text && results.length < 8) {
      results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL ?? "", snippet: topic.Text });
    }
  }

  if (results.length === 0) {
    return {
      ok: false,
      error:
        "No instant results. Add BRAVE_SEARCH_API_KEY or TAVILY_API_KEY on the server for full web search.",
    };
  }

  return { ok: true, query, provider: "duckduckgo_instant", results };
}

/** Search the public web for current information. */
export async function searchWeb(query: string, maxResults = 6): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { ok: false, error: "query is required" };
  const max = Math.min(10, Math.max(1, maxResults));

  if (braveKey()) {
    const r = await searchBrave(q, max);
    if (r.ok) return r;
  }
  if (tavilyKey()) {
    const r = await searchTavily(q, max);
    if (r.ok) return r;
  }
  return searchDuckDuckGoInstant(q);
}
