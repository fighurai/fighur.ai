"use client";

import type { UserLocationHint } from "@/lib/client-location";
import { reverseGeocodePlace } from "@/lib/reverse-geocode";

/** Bump when reverse-geocode provider changes so stale/wrong caches are dropped. */
const STORAGE_KEY = "fighurai-client-location-v2";

export type BrowserLocationResult = UserLocationHint | null;

/** Read cached browser location (session). */
export function readCachedBrowserLocation(): BrowserLocationResult {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocationHint;
    // Require a place label or usable coordinates — never trust empty shells.
    if (parsed?.city || (parsed?.latitude !== undefined && parsed?.longitude !== undefined)) {
      return parsed;
    }
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

function clearLegacyCache(): void {
  try {
    sessionStorage.removeItem("fighurai-client-location-v1");
  } catch {
    /* ignore */
  }
}

/**
 * Request browser geolocation (GPS) and reverse-geocode to a city label.
 * Uses cache when present; pass `{ force: true }` to refresh.
 */
export function detectBrowserLocation(opts?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(readCachedBrowserLocation());
  }

  clearLegacyCache();

  if (!opts?.force) {
    const cached = readCachedBrowserLocation();
    if (cached?.city || (cached?.latitude !== undefined && cached?.longitude !== undefined)) {
      return Promise.resolve(cached);
    }
  }

  const timeoutMs = opts?.timeoutMs ?? 12_000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (loc: BrowserLocationResult) => {
      if (settled) return;
      settled = true;
      resolve(loc);
    };

    const timer = window.setTimeout(() => {
      finish(readCachedBrowserLocation());
    }, timeoutMs + 500);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        window.clearTimeout(timer);
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
        finish(loc);
      },
      () => {
        window.clearTimeout(timer);
        finish(readCachedBrowserLocation());
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: opts?.force ? 0 : 120_000,
      },
    );
  });
}
