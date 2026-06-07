"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { fetchUsageSummary, hydrateServerSession, clearSession } from "@/lib/auth-storage";

function UpgradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void hydrateServerSession().then((ok) => {
      setSignedIn(ok);
    });
  }, []);

  async function startCheckout() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        alreadyPro?: boolean;
      };
      if (data.alreadyPro) {
        await hydrateServerSession();
        router.push("/?upgraded=pro");
        return;
      }
      if (!res.ok || !data.url) {
        if (res.status === 401) {
          clearSession();
          setSignedIn(false);
          setError("Your session expired. Sign in again, then return here to upgrade.");
          return;
        }
        if (res.status === 503) {
          const dev = await fetch("/api/billing/upgrade", {
            method: "POST",
            credentials: "include",
          });
          const devData = (await dev.json().catch(() => ({}))) as { error?: string };
          if (dev.ok) {
            await hydrateServerSession();
            void fetchUsageSummary();
            router.push("/?upgraded=pro");
            return;
          }
          setError(devData.error || data.error || "Upgrade is not available yet.");
          return;
        }
        setError(data.error || "Could not start checkout.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col px-4 py-10 sm:py-14">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        FIGHURAI Pro
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Pro unlocks every configured AI model — GPT-4o, Groq, OpenRouter, NVIDIA, and Claude. Free
        accounts include unlimited chat with Claude Sonnet only.
      </p>

      <ul className="mt-6 space-y-2 text-sm text-[var(--text-muted)]">
        <li>✓ All models in the model picker</li>
        <li>✓ Same private data environment &amp; audit logs</li>
        <li>✓ Billed securely via Stripe</li>
      </ul>

      {canceled ? (
        <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-[var(--text-muted)]">
          Checkout was canceled. You can try again when ready.
        </p>
      ) : null}

      {!signedIn ? (
        <p className="mt-8 text-sm text-amber-200/90">
          <Link href="/sign-in" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/sign-up" className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
            create an account
          </Link>{" "}
          before upgrading.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startCheckout()}
          className="mt-8 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Redirecting to Stripe…" : "Upgrade to Pro"}
        </button>
      )}

      {error ? (
        <p className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
          {error}
        </p>
      ) : null}

      <p className="mt-8 text-center text-xs text-[var(--text-faint)]">
        <Link href="/" className="text-[var(--text-muted)] underline-offset-2 hover:underline">
          Back to chat
        </Link>
      </p>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div className="px-4 py-10 text-sm text-[var(--text-muted)]">Loading…</div>}>
      <UpgradeContent />
    </Suspense>
  );
}
