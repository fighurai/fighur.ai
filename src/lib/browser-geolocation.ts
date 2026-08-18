"use client";

import type { UserLocationHint } from "@/lib/client-location";
import { reverseGeocodePlace } from "@/lib/reverse-geocode";

/** Bump when reverse-geocode / permission policy changes so stale caches drop. */
const STORAGE_KEY = "fighurai-client-location-v3";

export type BrowserLocationResult = UserLocationHint | null;

/** Phone / tablet — iOS Safari is strict about user-gesture + geolocation. */
export function isMobileClient(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  try {
    return window.matchMedia("(max-width: 767px)").matches && navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

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

function positionToHint(pos: GeolocationPosition): Promise<UserLocationHint> {
  const { latitude, longitude } = pos.coords;
  return reverseGeocodePlace(latitude, longitude).then((place) => {
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
    return loc;
  });
}

/**
 * Start getCurrentPosition in the same turn as a tap (no awaits before it).
 * Required on iOS — awaiting Permissions API first kills the native popup.
 */
export function requestBrowserLocationFromGesture(opts?: {
  timeoutMs?: number;
}): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(readCachedBrowserLocation());
  }

  clearLegacyCaches();
  const mobile = isMobileClient();
  const timeoutMs = opts?.timeoutMs ?? (mobile ? 25_000 : 15_000);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (loc: BrowserLocationResult) => {
      if (settled) return;
      settled = true;
      resolve(loc);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs + 1_000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        void positionToHint(pos).then(finish).catch(() => {
          // Coords still usable if reverse-geocode fails.
          const { latitude, longitude } = pos.coords;
          const loc: UserLocationHint = { latitude, longitude, source: "browser" };
          cacheLocation(loc);
          finish(loc);
        });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      {
        // High accuracy often times out on cellular before the prompt finishes.
        enableHighAccuracy: mobile ? false : true,
        timeout: timeoutMs,
        maximumAge: mobile ? 0 : 60_000,
      },
    );
  });
}

/**
 * Request browser geolocation (GPS) and reverse-geocode to a city label.
 * Pass `{ force: true }` to refresh. On mobile, skips Permissions API pre-check
 * so the native prompt can still appear from a tap.
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

  const mobile = isMobileClient();

  // Desktop only: bail early if permanently denied.
  // Mobile: never await Permissions API here — it breaks iOS gesture → popup.
  if (!mobile) {
    const state = await permissionState();
    if (state === "denied") return null;
  }

  return requestBrowserLocationFromGesture({ timeoutMs: opts?.timeoutMs });
}
