/**
 * Bridges to native Capacitor plugins when running inside the iOS shell.
 * Plugins are optional — missing plugins fall back gracefully.
 */

import { isIosNativeApp } from "@/lib/native-platform";
import { hydrateServerSession, readSession } from "@/lib/auth-storage";

type AppleSignInPlugin = {
  authorize: (opts: {
    clientId: string;
    redirectURI: string;
    scopes: string;
    state?: string;
    nonce?: string;
  }) => Promise<{
    response?: {
      identityToken?: string;
      email?: string;
      givenName?: string;
      familyName?: string;
    };
  }>;
};

type IapPlugin = {
  getProducts: (opts: { productIdentifiers: string[] }) => Promise<{
    products?: Array<{ productId: string; title?: string; priceString?: string }>;
  }>;
  purchaseProduct: (opts: {
    productIdentifier: string;
    appAccountToken?: string;
  }) => Promise<{
    transactionId?: string;
    /** StoreKit 2 JWS when available */
    jwsRepresentation?: string;
    receipt?: string;
  }>;
  restorePurchases?: () => Promise<{ transactions?: Array<{ jwsRepresentation?: string }> }>;
};

function getAppleSignIn(): AppleSignInPlugin | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { CapAwesomeAppleSignIn?: AppleSignInPlugin; plugins?: Record<string, unknown> };
  // @capacitor-community/apple-sign-in registers as SignInWithApple
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, AppleSignInPlugin> } })
    .Capacitor?.Plugins;
  return plugins?.SignInWithApple ?? null;
}

function getIap(): IapPlugin | null {
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, IapPlugin> } }).Capacitor
    ?.Plugins;
  return plugins?.FigHurIAP ?? plugins?.InAppPurchase ?? plugins?.NativePurchases ?? null;
}

export async function nativeSignInWithApple(): Promise<{ ok: boolean; error?: string }> {
  if (!isIosNativeApp()) {
    return { ok: false, error: "Apple Sign In native is only available in the iOS app." };
  }
  const plugin = getAppleSignIn();
  if (!plugin?.authorize) {
    // Fallback: open web Apple SSO inside the WebView
    window.location.href = "/api/auth/sso/apple";
    return { ok: true };
  }

  try {
    const bundleId = "ai.fighur.app";
    const result = await plugin.authorize({
      clientId: bundleId,
      redirectURI: `${window.location.origin}/api/auth/sso/apple/callback`,
      scopes: "email name",
    });
    const token = result.response?.identityToken;
    if (!token) return { ok: false, error: "No identity token from Apple." };

    const fullName = [result.response?.givenName, result.response?.familyName]
      .filter(Boolean)
      .join(" ");

    const res = await fetch("/api/auth/sso/apple/native", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, fullName: fullName || undefined }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error || "Apple Sign In failed." };
    }
    await hydrateServerSession();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Apple Sign In failed." };
  }
}

export async function purchaseProWithAppleIap(): Promise<{
  ok: boolean;
  plan?: string;
  error?: string;
}> {
  if (!isIosNativeApp()) {
    return { ok: false, error: "In-app purchases are only available in the iOS app." };
  }

  const productId =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APPLE_IAP_PRODUCT_ID?.trim()) ||
    "ai.fighur.app.pro.monthly";

  const plugin = getIap();
  const userId = readSession()?.userId;

  try {
    let jws: string | undefined;

    if (plugin?.purchaseProduct) {
      const purchase = await plugin.purchaseProduct({
        productIdentifier: productId,
        appAccountToken: userId,
      });
      jws = purchase.jwsRepresentation;
    } else if (
      typeof window !== "undefined" &&
      (window as unknown as { webkit?: { messageHandlers?: { fighurIap?: { postMessage: (m: unknown) => void } } } })
        .webkit?.messageHandlers?.fighurIap
    ) {
      // Custom WKWebView bridge — native side posts result via fighurIapResult
      jws = await requestNativeIap(productId, userId);
    } else {
      return {
        ok: false,
        error:
          "StoreKit bridge not installed yet. After `npx cap add ios`, add the FigHurIAP Swift bridge (see docs/APP_STORE.md).",
      };
    }

    if (!jws) return { ok: false, error: "Purchase completed but no receipt was returned." };

    const res = await fetch("/api/billing/apple/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedTransaction: jws }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; plan?: string };
    if (!res.ok) return { ok: false, error: data.error || "Could not verify purchase." };
    await hydrateServerSession();
    return { ok: true, plan: data.plan || "pro" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Purchase failed." };
  }
}

function requestNativeIap(productId: string, userId?: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ jwsRepresentation?: string; error?: string }>).detail;
      window.removeEventListener("fighur-iap-result", handler);
      if (detail?.error) reject(new Error(detail.error));
      else resolve(detail?.jwsRepresentation);
    };
    window.addEventListener("fighur-iap-result", handler);
    (
      window as unknown as {
        webkit: { messageHandlers: { fighurIap: { postMessage: (m: unknown) => void } } };
      }
    ).webkit.messageHandlers.fighurIap.postMessage({
      action: "purchase",
      productId,
      appAccountToken: userId,
    });
    window.setTimeout(() => {
      window.removeEventListener("fighur-iap-result", handler);
      reject(new Error("Purchase timed out."));
    }, 120_000);
  });
}

export function canUseNativeAppleSignIn(): boolean {
  return isIosNativeApp();
}

function pinDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function pinNativeIosScroll() {
  if (!isIosNativeApp()) return;
  pinDocumentScroll();
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || isIosNativeApp();
}

function syncVisualViewport() {
  const vv = window.visualViewport;
  const inner = window.innerHeight;
  const vvh = vv?.height ?? inner;
  const top = vv?.offsetTop ?? 0;
  const kb = Math.max(0, inner - vvh - top);
  const html = document.documentElement;
  if (isIosNativeApp()) html.classList.add("native-app");
  html.dataset.kb = kb > 80 ? "1" : "";
  html.style.setProperty("--kb-height", `${Math.round(kb)}px`);
  if (isIosNativeApp() || isIosDevice()) pinDocumentScroll();
}

function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function syncNativeStatusBar(bg?: string) {
  const color =
    bg ||
    getComputedStyle(document.documentElement).getPropertyValue("--bg-deep").trim() ||
    "#08090d";
  const normalized = color.startsWith("#") ? color : "#08090d";
  const light = hexLuminance(normalized) > 0.45;
  document.documentElement.style.colorScheme = light ? "light" : "dark";
  if (!isIosNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: normalized });
    await StatusBar.setStyle({
      style: light ? Style.Dark : Style.Light,
    });
  } catch {
    /* plugin not synced yet */
  }
  try {
    const { Keyboard, KeyboardStyle } = await import("@capacitor/keyboard");
    await Keyboard.setStyle({
      style: light ? KeyboardStyle.Light : KeyboardStyle.Dark,
    });
  } catch {
    /* plugin not synced yet */
  }
}

let nativeChromeReady = false;

/** Dock the prompt to the keyboard; hide iOS accessory chrome in the native app. */
export async function configureNativeChrome() {
  if (nativeChromeReady) {
    syncVisualViewport();
    return;
  }
  nativeChromeReady = true;
  if (isIosNativeApp()) document.documentElement.classList.add("native-app");
  syncVisualViewport();
  window.visualViewport?.addEventListener("resize", syncVisualViewport);
  window.visualViewport?.addEventListener("scroll", syncVisualViewport);
  window.addEventListener("resize", syncVisualViewport);
  window.addEventListener("focusin", () => {
    if (!isIosDevice()) return;
    pinDocumentScroll();
    requestAnimationFrame(syncVisualViewport);
  });

  const vk = (
    navigator as Navigator & {
      virtualKeyboard?: { overlaysContent: boolean };
    }
  ).virtualKeyboard;
  if (vk) vk.overlaysContent = true;

  void syncNativeStatusBar();

  if (!isIosNativeApp()) return;
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
    await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    await Keyboard.setScroll({ isDisabled: true });
    await Keyboard.addListener("keyboardWillShow", () => {
      pinDocumentScroll();
      requestAnimationFrame(syncVisualViewport);
    });
    await Keyboard.addListener("keyboardDidShow", () => {
      pinDocumentScroll();
      syncVisualViewport();
    });
    await Keyboard.addListener("keyboardWillHide", () => {
      requestAnimationFrame(syncVisualViewport);
    });
  } catch {
    /* plugin not synced yet */
  }
}
