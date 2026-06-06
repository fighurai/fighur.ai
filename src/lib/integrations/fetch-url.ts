export type FetchUrlResult =
  | { ok: true; url: string; title: string; content: string; provider: string }
  | { ok: false; error: string };

const MAX_CHARS = 24_000;

function jinaKey(): string | null {
  const k = process.env.JINA_API_KEY?.trim() || process.env.SMILE_JINA_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function isValidHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname === "localhost") return null;
    return u;
  } catch {
    return null;
  }
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchViaJina(url: string): Promise<FetchUrlResult> {
  const target = url.startsWith("http") ? url : `https://${url}`;
  const readerUrl = `https://r.jina.ai/${target}`;
  const headers: Record<string, string> = { Accept: "text/plain" };
  const key = jinaKey();
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(readerUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    return { ok: false, error: `Could not read page (${res.status})` };
  }

  let text = await res.text();
  let title = target;
  const titleMatch = /^Title:\s*(.+)$/im.exec(text);
  if (titleMatch) title = titleMatch[1].trim();

  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n\n[truncated]`;
  }

  return { ok: true, url: target, title, content: text, provider: key ? "jina" : "jina_free" };
}

async function fetchDirect(url: string): Promise<FetchUrlResult> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "FIGHURAI/1.0 (link reader; +https://fighur.ai)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status} for ${url}` };
  }

  const type = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let content = raw;
  if (type.includes("html")) {
    content = stripHtmlToText(raw);
  }
  if (content.length > MAX_CHARS) {
    content = `${content.slice(0, MAX_CHARS)}\n\n[truncated]`;
  }
  if (!content.trim()) {
    return { ok: false, error: "Page had no readable text content." };
  }

  return { ok: true, url, title: url, content, provider: "direct" };
}

/** Read a public web page the user linked or asked about. */
export async function fetchWebPage(urlInput: string): Promise<FetchUrlResult> {
  const parsed = isValidHttpUrl(urlInput);
  if (!parsed) return { ok: false, error: "A valid http(s) URL is required." };

  const url = parsed.href;

  const jina = await fetchViaJina(url);
  if (jina.ok) return jina;

  return fetchDirect(url);
}

const PREFETCH_MAX_URLS = 3;
const PREFETCH_MAX_CHARS_PER_URL = 10_000;

/** Unique http(s) URLs from user text (strips trailing punctuation). */
export function extractLinkedUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]>"']+/gi);
  if (!matches?.length) return [];
  return [...new Set(matches.map((u) => u.replace(/[.,;:!?]+$/, "")))].slice(0, PREFETCH_MAX_URLS);
}

/** Server-side page load injected into the system prompt so every model can answer from the link. */
export async function buildPrefetchedUrlContext(urls: string[]): Promise<string> {
  if (!urls.length) return "";

  const sections: string[] = [];
  for (const url of urls) {
    const res = await fetchWebPage(url);
    if (res.ok) {
      const body =
        res.content.length > PREFETCH_MAX_CHARS_PER_URL
          ? `${res.content.slice(0, PREFETCH_MAX_CHARS_PER_URL)}\n\n[truncated]`
          : res.content;
      sections.push(`### ${res.title}\n**URL:** ${res.url}\n**Source:** ${res.provider}\n\n${body}`);
    } else {
      sections.push(`### ${url}\n**Fetch failed:** ${res.error}`);
    }
  }

  return `

## Linked page content (already loaded by the server)
The user's message included link(s). **Page text is below** — summarize and answer from it.
**Forbidden:** saying you lack internet access, cannot browse, or cannot open the linked website.
If a fetch failed, say what failed and answer from whatever content you do have.

${sections.join("\n\n---\n\n")}`;
}
