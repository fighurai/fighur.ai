"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchUsageSummary, hydrateServerSession, readSession } from "@/lib/auth-storage";

export default function UpgradePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void hydrateServerSession().then(() => {
      setSignedIn(Boolean(readSession()?.userId));
    });
  }, []);

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
        <li>✓ Same private data environment & audit logs</li>
        <li>✓ Priority for future billing via Stripe</li>
      </ul>

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
          onClick={async () => {
            setError(null);
            setBusy(true);
            try {
              const res = await fetch("/api/billing/upgrade", {
                method: "POST",
                credentials: "include",
              });
              const data = (await res.json().catch(() => ({}))) as { error?: string; plan?: string };
              if (!res.ok) {
                setError(data.error || "Upgrade is not available yet.");
                return;
              }
              await hydrateServerSession();
              void fetchUsageSummary();
              router.push("/?upgraded=pro");
            } finally {
              setBusy(false);
            }
          }}
          className="mt-8 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Upgrading…" : "Upgrade to Pro"}
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
