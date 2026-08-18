"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { readSession } from "@/lib/auth-storage";
import { COLORS_CHROME_STORE_URL } from "@/lib/colors-chrome-store";

export function SettingsExtensionPanel() {
  const [plan, setPlan] = useState<"free" | "pro" | null>(readSession()?.plan ?? null);
  const isPro = plan === "pro";

  useEffect(() => {
    const sync = () => setPlan(readSession()?.plan ?? null);
    sync();
    window.addEventListener("smile-auth-changed", sync);
    return () => window.removeEventListener("smile-auth-changed", sync);
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">FIGHURAI Colors</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              Chrome extension for the same Colors controls on any website — background and text,
              unlocked with Pro.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2.5 py-0.5 text-[0.6rem] font-semibold text-[var(--accent)]">
            Pro
          </span>
        </div>

        {!isPro ? (
          <p className="mt-3 text-[0.7rem] leading-relaxed text-[var(--text-faint)]">
            Install anytime; Colors unlocks when you’re on Pro.{" "}
            <Link href="/upgrade" className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              Upgrade
            </Link>
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={COLORS_CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] shadow-[0_0_16px_var(--accent-glow)] transition hover:brightness-110"
          >
            Add to Chrome
          </a>
          <Link
            href="/extension"
            className="inline-flex rounded-full border border-white/[0.12] px-4 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
          >
            How it works
          </Link>
        </div>
      </div>
    </div>
  );
}
