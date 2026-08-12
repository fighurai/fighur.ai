"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { hydrateServerSession, readSession } from "@/lib/auth-storage";

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
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        FIGHURAI Colors
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
        Bring FIGHURAI’s <strong className="text-[var(--text-primary)]">Colors</strong> settings to
        any website: background and text, synced with Pro.
      </p>

      {justInstalled ? (
        <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-100">
          Extension installed. Stay signed in here so Pro syncs, pin the icon, then open any website
          and click <strong>Colors</strong> in the corner or the toolbar icon.
        </p>
      ) : null}

      {!isPro ? (
        <div className="mt-6 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-3 text-xs text-[var(--text-muted)]">
          <p className="font-semibold text-[var(--text-primary)]">Pro required</p>
          <p className="mt-1">
            Colors on any website is included with FIGHURAI Pro.{" "}
            {!signedIn ? (
              <>
                <Link href="/sign-in" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                  Sign in
                </Link>{" "}
                or{" "}
              </>
            ) : null}
            <Link href="/upgrade" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Upgrade to Pro
            </Link>
            .
          </p>
        </div>
      ) : null}

      <a
        href="/api/extension/download"
        download="fighur-page-theme.zip"
        className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_0_24px_var(--accent-glow)] transition hover:brightness-110"
      >
        Download FIGHURAI Colors (.zip)
      </a>
      <p className="mt-2 text-center text-[0.65rem] text-[var(--text-faint)]">
        If the button does nothing, open{" "}
        <a
          href="/api/extension/download"
          download="fighur-page-theme.zip"
          className="text-[var(--accent)] underline-offset-2 hover:underline"
        >
          this direct link
        </a>
        , or right‑click → Save Link As…
      </p>
      <p className="mt-2 text-center text-[0.65rem] text-[var(--text-faint)]">
        Chrome Web Store listing coming soon. Until then, install with Developer mode (same files
        Chrome will review). The extension does not receive your email or name — only a Pro check.
        Privacy:{" "}
        <Link href="/privacy" className="underline-offset-2 hover:underline">
          fighur.ai/privacy
        </Link>
        .
      </p>

      <ol className="mt-8 space-y-4 text-sm text-[var(--text-muted)]">
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">1. Download &amp; unzip</p>
          <p className="mt-1 text-xs leading-relaxed">
            Save <code className="text-[0.65rem]">fighur-page-theme.zip</code>, then unzip it to a
            folder you’ll keep (don’t delete that folder after installing).
          </p>
        </li>
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">2. Load unpacked in Chrome</p>
          <p className="mt-1 text-xs leading-relaxed">
            Open <code className="text-[0.65rem]">chrome://extensions</code> → turn on{" "}
            <strong>Developer mode</strong> → <strong>Load unpacked</strong> → select the unzipped
            folder (the one with <code className="text-[0.65rem]">manifest.json</code>).
          </p>
        </li>
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">3. Pin it</p>
          <p className="mt-1 text-xs leading-relaxed">
            Click the puzzle piece in Chrome’s toolbar → pin <strong>FIGHURAI Colors</strong>.
          </p>
        </li>
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">4. Sync Pro</p>
          <p className="mt-1 text-xs leading-relaxed">
            Keep this tab open while signed in on Pro. The extension reads your plan from FIGHURAI
            so Colors unlocks on other sites.
          </p>
        </li>
        <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <p className="font-semibold text-[var(--text-primary)]">5. Use it anywhere</p>
          <p className="mt-1 text-xs leading-relaxed">
            Visit any website. Click the floating <strong>Colors</strong> button (bottom-right) or
            the toolbar icon. Pick background and text — same controls as Colors on FIGHURAI.
          </p>
        </li>
      </ol>

      <div className="mt-8 rounded-xl border border-white/[0.08] px-4 py-3 text-xs leading-relaxed text-[var(--text-faint)]">
        <p className="font-semibold text-[var(--text-muted)]">What you get</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Install → pin → Colors on any website</li>
          <li>Same background and text controls as Colors on FIGHURAI</li>
          <li>Pro entitlement only — no email or name shared with the extension</li>
        </ul>
      </div>

      <p className="mt-8 text-center text-xs text-[var(--text-faint)]">
        <Link href="/legal" className="underline-offset-2 hover:underline">
          Own &amp; sell checklist
        </Link>
        {" · "}
        <Link href="/eula" className="underline-offset-2 hover:underline">
          EULA
        </Link>
        {" · "}
        <Link href="/settings?tab=apps" className="underline-offset-2 hover:underline">
          Settings → Apps
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
