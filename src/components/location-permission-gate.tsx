"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { detectBrowserLocation } from "@/lib/browser-geolocation";

const PROMPT_KEY = "fighurai-location-prompt-v2";

function promptAlreadyHandled(): boolean {
  try {
    return localStorage.getItem(PROMPT_KEY) === "done";
  } catch {
    return false;
  }
}

function markPromptHandled(): void {
  try {
    localStorage.setItem(PROMPT_KEY, "done");
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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (typeof window === "undefined") return;
      if (promptAlreadyHandled()) return;
      if (!navigator.geolocation) {
        markPromptHandled();
        return;
      }

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
          // Permanently blocked in browser settings — nothing we can prompt for.
          markPromptHandled();
          return;
        }
      } catch {
        /* Permissions API missing — still show our gate */
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

  const allow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const loc = await detectBrowserLocation({ force: true, timeoutMs: 20_000 });
      if (loc) {
        window.dispatchEvent(new CustomEvent("fighur-location-ready", { detail: loc }));
        close();
        return;
      }
      setError(
        "Location wasn’t shared. Check the address bar for a blocked pin, set Location to Allow for fighur.ai, then try again.",
      );
    } catch {
      setError("Couldn’t request location. You can still type your city in chat.");
    } finally {
      setBusy(false);
    }
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
            onClick={() => void allow()}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg-deep)] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Waiting for browser…" : "Allow location"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/[0.12] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] disabled:opacity-60"
          >
            Not now
          </button>
        </div>
        <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
          Tap Allow location, then choose Allow in the browser popup. You can change this later in
          your browser’s site settings.
        </p>
      </div>
    </div>
  );
}
