"use client";

import type { UserLocationHint } from "@/lib/client-location";
import { reverseGeocodePlace } from "@/lib/reverse-geocode";

/** Bump when reverse-geocode / permission policy changes so stale caches drop. */
const STORAGE_KEY = "fighurai-client-location-v3";

export type BrowserLocationResult = UserLocationHint | null;

/** Read cached browser location (session). */
export function readCachedBrowserLocation(): BrowserLocationResult {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocationHint;
    if (
      parsed?.source === "browser" &&
      (parsed.city || (parsed.latitude !== undefined && parsed.longitude !== undefined))
    ) {
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

function clearLegacyCaches(): void {
  try {
    sessionStorage.removeItem("fighurai-client-location-v1");
    sessionStorage.removeItem("fighurai-client-location-v2");
  } catch {
    /* ignore */
  }
}

async function permissionState(): Promise<PermissionState | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

/**
 * Request browser geolocation (GPS) and reverse-geocode to a city label.
 * Must run from a user gesture (e.g. Send) for the permission popup to appear.
 * Pass `{ force: true }` to re-prompt / refresh even if cached.
 */
export async function detectBrowserLocation(opts?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return readCachedBrowserLocation();
  }

  clearLegacyCaches();

  if (!opts?.force) {
    const cached = readCachedBrowserLocation();
    if (cached) return cached;
  }

  const state = await permissionState();
  // Already permanently denied — don't burn time waiting on a silent failure.
  if (state === "denied") return null;

  const timeoutMs = opts?.timeoutMs ?? 15_000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (loc: BrowserLocationResult) => {
      if (settled) return;
      settled = true;
      resolve(loc);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs + 800);

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
        finish(null);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: opts?.force ? 0 : 60_000,
      },
    );
  });
}
