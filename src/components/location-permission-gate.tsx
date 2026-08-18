"use client";

import { useCallback, useEffect, useId, useState } from "react";

import {
  detectBrowserLocation,
  isMobileClient,
  readCachedBrowserLocation,
  requestBrowserLocationFromGesture,
} from "@/lib/browser-geolocation";

const PROMPT_KEY_DESKTOP = "fighurai-location-prompt-v2";
/** Separate key so mobile users who got stuck without a popup see the gate again. */
const PROMPT_KEY_MOBILE = "fighurai-location-prompt-mobile-v3";

function promptKey(): string {
  return isMobileClient() ? PROMPT_KEY_MOBILE : PROMPT_KEY_DESKTOP;
}

function promptAlreadyHandled(): boolean {
  try {
    return localStorage.getItem(promptKey()) === "done";
  } catch {
    return false;
  }
}

function markPromptHandled(): void {
  try {
    localStorage.setItem(promptKey(), "done");
  } catch {
    /* ignore */
  }
}

/**
 * First-run location gate. Browsers only show the native geolocation popup
 * after a clear user gesture — this dialog’s Allow button is that gesture.
 */
export function LocationPermissionGate() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const onMobile = isMobileClient();
    setMobile(onMobile);

    void (async () => {
      if (typeof window === "undefined") return;
      if (!navigator.geolocation) {
        markPromptHandled();
        return;
      }

      // Already have GPS this session — skip.
      if (readCachedBrowserLocation()) {
        markPromptHandled();
        return;
      }

      if (promptAlreadyHandled()) return;

      // Desktop: skip gate if Permissions API says granted/denied.
      // Mobile: do NOT trust "denied" — Safari/Chrome often misreport; always show the gate.
      if (!onMobile) {
        try {
          const status = await navigator.permissions?.query({
            name: "geolocation" as PermissionName,
          });
          if (cancelled) return;
          if (status?.state === "granted") {
            const loc = await detectBrowserLocation({ force: true, timeoutMs: 8_000 });
            if (loc) {
              window.dispatchEvent(new CustomEvent("fighur-location-ready", { detail: loc }));
            }
            markPromptHandled();
            return;
          }
          if (status?.state === "denied") {
            markPromptHandled();
            return;
          }
        } catch {
          /* still show gate */
        }
      }

      if (!cancelled) setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    markPromptHandled();
    setOpen(false);
  }, []);

  const allow = useCallback(() => {
    setBusy(true);
    setError(null);

    // Mobile: call getCurrentPosition in this same turn (no prior awaits).
    const request = isMobileClient()
      ? requestBrowserLocationFromGesture({ timeoutMs: 25_000 })
      : detectBrowserLocation({ force: true, timeoutMs: 20_000 });

    void request
      .then((loc) => {
        if (loc) {
          window.dispatchEvent(new CustomEvent("fighur-location-ready", { detail: loc }));
          close();
          return;
        }
        setError(
          isMobileClient()
            ? "Location wasn’t shared. In Safari/Chrome: tap Aa or the lock icon → Website Settings → Location → Allow, then try again."
            : "Location wasn’t shared. Check the address bar for a blocked pin, set Location to Allow for fighur.ai, then try again.",
        );
      })
      .catch(() => {
        setError("Couldn’t request location. You can still type your city in chat.");
      })
      .finally(() => setBusy(false));
  }, [close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.1] bg-[var(--bg-elevated)] p-5 shadow-2xl sm:p-6"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Welcome
        </p>
        <h2 id={titleId} className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Share your location?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          FIGHURAI uses your location for local answers like weather and nearby context. Your
          precise place stays on this device and is only sent with your chats when needed — not
          sold or used for ads.
        </p>
        {error ? (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            disabled={busy}
            // pointerup keeps the iOS user-gesture chain more reliably than click alone
            onPointerUp={(e) => {
              if (e.pointerType === "touch" || mobile) {
                e.preventDefault();
                if (!busy) allow();
              }
            }}
            onClick={() => {
              if (!mobile && !busy) allow();
            }}
            className="inline-flex h-12 flex-1 touch-manipulation items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:brightness-110 disabled:opacity-60 sm:h-11"
          >
            {busy ? "Waiting for browser…" : "Allow location"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="inline-flex h-12 flex-1 touch-manipulation items-center justify-center rounded-full border border-white/[0.12] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] disabled:opacity-60 sm:h-11"
          >
            Not now
          </button>
        </div>
        <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          {mobile
            ? "Tap Allow location, then Allow on the system prompt. This only needs to happen once."
            : "Tap Allow location, then choose Allow in the browser popup. You can change this later in your browser’s site settings."}
        </p>
      </div>
    </div>
  );
}
