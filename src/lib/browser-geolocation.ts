"use client";

import type { UserLocationHint } from "@/lib/client-location";
import { reverseGeocodePlace } from "@/lib/reverse-geocode";

const STORAGE_KEY = "fighurai-client-location-v4";

export type BrowserLocationResult = UserLocationHint | null;

/** Phone / tablet — iOS only shows the system Location popup from a tap. */
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
      (parsed.city || parsed.latitude !== undefined)
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
    sessionStorage.removeItem("fighurai-client-location-v3");
  } catch {
    /* ignore */
  }
}

function finishFromPosition(pos: GeolocationPosition): Promise<UserLocationHint> {
  const { latitude, longitude } = pos.coords;
  return reverseGeocodePlace(latitude, longitude)
    .then((place) => {
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
    })
    .catch(() => {
      const loc: UserLocationHint = { latitude, longitude, source: "browser" };
      cacheLocation(loc);
      return loc;
    });
}

/**
 * Call navigator.geolocation in the same turn as a user tap.
 * This is what triggers the **iPhone/Safari system Location popup** (not a custom UI).
 * Do not await anything before calling this from a click/touch handler.
 */
export function requestNativeLocationFromGesture(opts?: {
  timeoutMs?: number;
}): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(readCachedBrowserLocation());
  }

  clearLegacyCaches();
  const timeoutMs = opts?.timeoutMs ?? 20_000;

  return new Promise((resolve) => {
    let settled = false;
    const done = (loc: BrowserLocationResult) => {
      if (settled) return;
      settled = true;
      resolve(loc);
    };

    const timer = window.setTimeout(() => done(null), timeoutMs + 500);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        void finishFromPosition(pos).then(done);
      },
      () => {
        window.clearTimeout(timer);
        done(null);
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: 0,
      },
    );
  });
}

/**
 * Quiet lookup when permission is already granted / desktop mount.
 * On iPhone this often will not show the system popup — use
 * requestNativeLocationFromGesture from Send instead.
 */
export function detectBrowserLocation(): Promise<BrowserLocationResult> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(readCachedBrowserLocation());
  }

  clearLegacyCaches();

  const cached = readCachedBrowserLocation();
  if (cached) return Promise.resolve(cached);

  // On mobile, don't silently call getCurrentPosition on mount — it fails
  // without showing the system popup and then we fall back to Atlanta IP.
  if (isMobileClient()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void finishFromPosition(pos).then(resolve);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  });
}
