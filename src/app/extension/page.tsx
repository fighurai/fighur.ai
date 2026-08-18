"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { hydrateServerSession, readSession } from "@/lib/auth-storage";
import { COLORS_CHROME_STORE_URL } from "@/lib/colors-chrome-store";

function ExtensionContent() {
  const searchParams = useSearchParams();
  const justInstalled = searchParams.get("installed") === "1";
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void hydrateServerSession().then((ok) => {
      setSignedIn(ok);
      setPlan(readSession()?.plan ?? null);
    });
  }, []);

  const isPro = plan === "pro";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 py-10 sm:py-14">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
        Chrome extension
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        FIGHURAI Colors
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Bring FIGHURAI’s <strong className="text-[var(--text-primary)]">Colors</strong> settings to
        any website — background and text, unlocked with Pro.
      </p>

      {justInstalled ? (
        <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-100">
          Extension installed. Stay signed in here on Pro, pin the icon, then open any site and use{" "}
          <strong>Colors</strong> from the corner or the toolbar.
        </p>
      ) : null}

      {!isPro ? (
        <div className="mt-6 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-3 text-xs text-[var(--text-muted)]">
          <p className="font-semibold text-[var(--text-primary)]">Pro required</p>
          <p className="mt-1">
            Colors on any website is included with FIGHURAI Pro.{" "}
            {!signedIn ? (
              <>
                <Link
                  href="/sign-in"
                  className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  Sign in
                </Link>{" "}
                or{" "}
              </>
            ) : null}
            <Link
              href="/upgrade"
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Upgrade to Pro
            </Link>
            .
          </p>
        </div>
      ) : null}

      <a
        href={COLORS_CHROME_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110"
      >
        Add to Chrome
      </a>
      <p className="mt-2 text-center text-[0.65rem] text-[var(--text-faint)]">
        Opens the Chrome Web Store. The extension only checks Pro status — not your email or name.{" "}
        <Link href="/privacy" className="underline-offset-2 hover:underline">
          Privacy
        </Link>
        .
      </p>

      <ol className="mt-8 space-y-3 text-sm text-[var(--text-muted)]">
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">1. Install from Chrome</p>
          <p className="mt-1 text-xs leading-relaxed">
            Tap <strong>Add to Chrome</strong> above, then <strong>Add extension</strong> on the
            store page.
          </p>
        </li>
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">2. Pin it</p>
          <p className="mt-1 text-xs leading-relaxed">
            Puzzle icon in Chrome’s toolbar → pin <strong>FIGHURAI Colors</strong>.
          </p>
        </li>
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">3. Sync Pro &amp; use anywhere</p>
          <p className="mt-1 text-xs leading-relaxed">
            Stay signed in on fighur.ai with Pro, then open any website and use the floating{" "}
            <strong>Colors</strong> control or the toolbar icon.
          </p>
        </li>
      </ol>

      <p className="mt-8 text-center text-xs text-[var(--text-faint)]">
        <Link href="/eula" className="underline-offset-2 hover:underline">
          EULA
        </Link>
        {" · "}
        <Link href="/settings?tab=extension" className="underline-offset-2 hover:underline">
          Settings → Extension
        </Link>
        {" · "}
        <Link href="/upgrade" className="underline-offset-2 hover:underline">
          Upgrade
        </Link>
        {" · "}
        <Link href="/" className="underline-offset-2 hover:underline">
          Back to chat
        </Link>
      </p>
    </div>
  );
}

export default function ExtensionPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-xl px-4 py-14 text-sm text-[var(--text-muted)]">Loading…</div>
      }
    >
      <ExtensionContent />
    </Suspense>
  );
}
