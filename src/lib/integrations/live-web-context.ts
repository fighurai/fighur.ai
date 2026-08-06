import { fetchWeather } from "@/lib/integrations/weather-api";
import { fetchWebPage } from "@/lib/integrations/fetch-url";
import { searchWeb, simplifySearchQuery } from "@/lib/integrations/web-search-api";

const GREETING_RE =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yo|sup|good (morning|afternoon|evening))[\s!.]*$/i;

/**
 * Skip auto web for pure greetings or messages that are mostly pasted code.
 * Everything else gets live grounding so the chatbot actually has web context.
 */
export function shouldAutoGroundWeb(userText: string): boolean {
  const t = userText.trim();
  if (t.length < 2) return false;
  if (GREETING_RE.test(t)) return false;
  const fences = [...t.matchAll(/```[\s\S]*?```/g)];
  const codeChars = fences.reduce((n, m) => n + m[0].length, 0);
  if (t.length > 40 && codeChars / t.length > 0.65) return false;
  return true;
}

function looksLikeWeather(text: string): boolean {
  return /\b(weather|forecast|temperature|humidity|rain|snow|hot|cold)\b/i.test(text);
}

function extractCityHint(text: string): string | null {
  const m =
    /\b(?:weather|forecast|temperature)\s+(?:in|for|at)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i.exec(
      text,
    ) || /\bin\s+([A-Za-z][A-Za-z\s.'-]{1,40})\b.*\b(weather|forecast)\b/i.exec(text);
  if (!m?.[1]) return null;
  return m[1].replace(/[?.!,]+$/, "").trim();
}

/**
 * Server-side live web grounding. Runs search (and weather when relevant) before
 * the model answers — does not rely on the model deciding to call tools.
 */
export async function buildLiveWebContext(userText: string): Promise<string> {
  if (!shouldAutoGroundWeb(userText)) return "";

  const sections: string[] = [];
  const query = simplifySearchQuery(userText) || userText.trim();

  if (looksLikeWeather(userText)) {
    const city = extractCityHint(userText);
    if (city) {
      try {
        const weather = await fetchWeather(city);
        if (weather.ok) {
          sections.push(
            `### Live weather (${city})\n\`\`\`json\n${JSON.stringify(weather, null, 2).slice(0, 3500)}\n\`\`\``,
          );
        } else {
          sections.push(`### Live weather\nCould not fetch weather for ${city}: ${weather.error}`);
        }
      } catch (e) {
        sections.push(
          `### Live weather\nWeather lookup failed: ${e instanceof Error ? e.message : "error"}`,
        );
      }
    }
  }

  try {
    const search = await searchWeb(query, 6);
    if (search.ok && search.results.length) {
      const lines = search.results.map((r, i) => {
        const bits = [`${i + 1}. **${r.title}**`];
        if (r.url) bits.push(`   URL: ${r.url}`);
        if (r.snippet) bits.push(`   ${r.snippet.slice(0, 320)}`);
        return bits.join("\n");
      });
      sections.push(
        `### Live web search (provider: ${search.provider})\nQuery: ${search.query}\n\n${lines.join("\n\n")}`,
      );

      // Prefer Wikipedia (has incumbents / facts), then other real URLs — skip news wrappers
      const rankedUrls = [...search.results]
        .sort((a, b) => {
          const aw = /wikipedia\.org/i.test(a.url) ? 1 : 0;
          const bw = /wikipedia\.org/i.test(b.url) ? 1 : 0;
          return bw - aw;
        })
        .map((r) => r.url);
      const toFetch = rankedUrls
        .filter(
          (u) =>
            /^https?:\/\//i.test(u) &&
            !/news\.google\.com/i.test(u) &&
            !/bing\.com\/news/i.test(u) &&
            !/duckduckgo\.com\/l\//i.test(u),
        )
        .slice(0, 2);

      for (const url of toFetch) {
        try {
          const page = await fetchWebPage(url);
          if (!page.ok) continue;
          const body =
            page.content.length > 6_000
              ? `${page.content.slice(0, 6_000)}\n\n[truncated]`
              : page.content;
          sections.push(`### Fetched page: ${page.title}\nURL: ${page.url}\n\n${body}`);
        } catch {
          /* skip page */
        }
      }
    } else if (!search.ok) {
      sections.push(`### Live web search\nSearch unavailable: ${search.error}`);
    }
  } catch (e) {
    sections.push(
      `### Live web search\nSearch failed: ${e instanceof Error ? e.message : "error"}`,
    );
  }

  if (!sections.length) return "";

  return `

## Live web context (fetched by FIGHURAI server — use this; do not claim you lack internet)
The following was retrieved from the public internet for this user message. Ground your answer in it and cite URLs when present. If it is incomplete, you may still call web_search / fetch_url tools for more.

${sections.join("\n\n")}`;
}
