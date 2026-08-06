/**
 * Detect Capacitor / native iOS shell vs plain Safari.
 */

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } };
  try {
    return Boolean(w.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function isIosNativeApp(): boolean {
  if (!isNativeApp()) return false;
  const w = window as Window & {
    Capacitor?: { getPlatform?: () => string };
  };
  try {
    return w.Capacitor?.getPlatform?.() === "ios";
  } catch {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }
}

/** App Store Guideline 3.1.1 — do not open Stripe checkout inside the iOS app. */
export function shouldUseAppleIap(): boolean {
  return isIosNativeApp();
}
