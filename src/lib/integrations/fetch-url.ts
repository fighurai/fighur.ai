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
