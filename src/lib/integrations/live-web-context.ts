import { fetchWeather, fetchWeatherAtCoordinates } from "@/lib/integrations/weather-api";
import { searchWeb, simplifySearchQuery } from "@/lib/integrations/web-search-api";

const GREETING_RE =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yo|sup|good (morning|afternoon|evening))[\s!.]*$/i;

/** Only auto-ground when the message likely needs live facts (keeps TTFB low). */
const LIVE_HINT_RE =
  /\b(news|latest|today|tonight|right now|currently|weather|forecast|temperature|humidity|price|stock|score|who is|who'?s|president|prime minister|ceo of|happened|breaking|headline|search for|look up|as of|current events?)\b/i;

/**
 * Skip auto web for greetings, code dumps, and ordinary chat that doesn't need live data.
 * The model can still call web_search / fetch_url tools when needed.
 */
export function shouldAutoGroundWeb(userText: string): boolean {
  const t = userText.trim();
  if (t.length < 2) return false;
  if (GREETING_RE.test(t)) return false;
  const fences = [...t.matchAll(/```[\s\S]*?```/g)];
  const codeChars = fences.reduce((n, m) => n + m[0].length, 0);
  if (t.length > 40 && codeChars / t.length > 0.65) return false;
  return LIVE_HINT_RE.test(t);
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

async function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fast server-side live web grounding (search snippets only — no deep page fetch).
 * Deep reads stay on fetch_url tools so the HTTP response can start sooner.
 */
export async function buildLiveWebContext(
  userText: string,
  userLocation?: {
    city?: string;
    latitude?: number;
    longitude?: number;
    source?: string;
  } | null,
): Promise<string> {
  if (!shouldAutoGroundWeb(userText)) return "";

  const sections: string[] = [];
  const query = simplifySearchQuery(userText) || userText.trim();

  // Hard budget so chat TTFB stays snappy even when providers are slow.
  const budgetMs = 4_500;

  const work = (async () => {
    if (looksLikeWeather(userText)) {
      const city = extractCityHint(userText);
      const precise = userLocation?.source === "browser";
      try {
        let weather;
        if (city) {
          weather = await fetchWeather(city);
        } else if (
          precise &&
          userLocation?.latitude !== undefined &&
          userLocation?.longitude !== undefined
        ) {
          weather = await fetchWeatherAtCoordinates(
            userLocation.latitude,
            userLocation.longitude,
          );
        } else if (precise && userLocation?.city) {
          weather = await fetchWeather(userLocation.city);
        }

        if (weather) {
          if (weather.ok) {
            const label = city || weather.location || userLocation?.city || "here";
            sections.push(
              `### Live weather (${label})\n\`\`\`json\n${JSON.stringify(weather, null, 2).slice(0, 3500)}\n\`\`\``,
            );
          } else {
            sections.push(
              `### Live weather\nCould not fetch weather: ${weather.error}`,
            );
          }
        } else if (!city && !precise) {
          sections.push(
            `### Live weather\nNo precise browser location yet — ask the user which city (do not use IP/CDN guesses).`,
          );
        }
      } catch (e) {
        sections.push(
          `### Live weather\nWeather lookup failed: ${e instanceof Error ? e.message : "error"}`,
        );
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
      } else if (!search.ok) {
        sections.push(`### Live web search\nSearch unavailable: ${search.error}`);
      }
    } catch (e) {
      sections.push(
        `### Live web search\nSearch failed: ${e instanceof Error ? e.message : "error"}`,
      );
    }
  })();

  await withBudget(work, budgetMs);

  if (!sections.length) return "";

  return `

## Live web context (fetched by FIGHURAI server — use this; do not claim you lack internet)
The following was retrieved from the public internet for this user message. Ground your answer in it and cite URLs when present. If it is incomplete, call web_search / fetch_url for more.

${sections.join("\n\n")}`;
}
