"use client";

import type { UserLocationHint } from "@/lib/client-location";
import { reverseGeocodePlace } from "@/lib/reverse-geocode";

const STORAGE_KEY = "fighurai-client-location-v4";

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

function clearLegacyCaches(): void {
  try {
    sessionStorage.removeItem("fighurai-client-location-v1");
    sessionStorage.removeItem("fighurai-client-location-v2");
    sessionStorage.removeItem("fighurai-client-location-v3");
  } catch {
    /* ignore */
  }
}

/**
 * Request browser geolocation once (same quiet flow as the Jun 2026 version that
 * “just worked” on mobile — no custom welcome gate, no Permissions pre-check).
 * Uses a working reverse-geocoder (Open-Meteo reverse does not exist).
 */
export function detectBrowserLocation(): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(readCachedBrowserLocation());
  }

  clearLegacyCaches();

  const cached = readCachedBrowserLocation();
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const place = await reverseGeocodePlace(latitude, longitude);
        const loc: UserLocationHint = {
          city: place?.city,
          region: place?.region,
          country: place?.country,
          countryCode: place?.countryCode,
          latitude,
          longitude,
          source: "browser",
        };
        cacheLocation(loc);
        resolve(loc);
      },
      () => resolve(null),
      // Original mobile-friendly options (high accuracy often fails on cellular).
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  });
}
