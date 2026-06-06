"use client";

import type { UserLocationHint } from "@/lib/client-location";

const STORAGE_KEY = "fighurai-client-location-v1";

export type BrowserLocationResult = UserLocationHint | null;

/** Read cached browser location (session). */
export function readCachedBrowserLocation(): BrowserLocationResult {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocationHint;
    if (parsed && (parsed.city || parsed.latitude !== undefined)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function cacheLocation(loc: UserLocationHint): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    /* quota */
  }
}

async function reverseGeocodeClient(lat: number, lon: number): Promise<{ city?: string; region?: string; country?: string }> {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("language", "en");
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = (await res.json()) as {
      results?: Array<{ name?: string; admin1?: string; country?: string }>;
    };
    const hit = data.results?.[0];
    if (!hit) return {};
    return { city: hit.name, region: hit.admin1, country: hit.country };
  } catch {
    return {};
  }
}

/** Request browser geolocation once (with Open-Meteo reverse geocode). */
export function detectBrowserLocation(): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(readCachedBrowserLocation());
  }

  const cached = readCachedBrowserLocation();
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const place = await reverseGeocodeClient(latitude, longitude);
        const loc: UserLocationHint = {
          city: place.city,
          region: place.region,
          country: place.country,
          latitude,
          longitude,
          source: "browser",
        };
        cacheLocation(loc);
        resolve(loc);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  });
}
