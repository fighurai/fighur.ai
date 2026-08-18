"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LegalShell } from "@/components/legal-shell";

type Step = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
  youMustDo: boolean;
};

const STEPS: Step[] = [
  {
    id: "ip-own",
    title: "1. Confirm you own the IP",
    detail:
      "You (or your company) must own the code, brand, and extension. Anyone who helped build it should sign an IP assignment. A template is linked below.",
    href: "/downloads/ip-assignment-template.txt",
    hrefLabel: "Download IP assignment template",
    youMustDo: true,
  },
  {
    id: "entity",
    title: "1b. Form / use a business entity (recommended)",
    detail:
      "Form an LLC or corporation in your state (or use your existing company). Put FIGHURAI, Stripe, domains, and the Chrome publisher under that entity so you can sell cleanly.",
    youMustDo: true,
  },
  {
    id: "trademark",
    title: "1c. Protect the name (recommended)",
    detail:
      "Search USPTO / your country’s trademark office for FIGHURAI conflicts, then file a trademark if clear. Keep fighur.ai / fighurai domains renewed under the same owner.",
    youMustDo: true,
  },
  {
    id: "license",
    title: "1d. Proprietary license in the repo",
    detail: "Done in product: LICENSE is All Rights Reserved; Terms + EULA reserve ownership.",
    href: "/terms",
    hrefLabel: "Terms of Use",
    youMustDo: false,
  },
  {
    id: "sell-pro",
    title: "2. Sell via FIGHURAI Pro",
    detail:
      "Customers buy Pro on fighur.ai (Stripe / Apple). The Colors extension unlocks for Pro. Keep Stripe business details matching your legal entity.",
    href: "/upgrade",
    hrefLabel: "Upgrade page",
    youMustDo: true,
  },
  {
    id: "terms-privacy",
    title: "2b. Terms, Privacy, EULA live",
    detail: "Product pages are live. Have a lawyer review before major launch or fundraising.",
    href: "/eula",
    hrefLabel: "Extension EULA",
    youMustDo: false,
  },
  {
    id: "cws-account",
    title: "3. Chrome Web Store developer account",
    detail:
      "Register at the Chrome Web Store Developer Dashboard (~$5 one-time). Use your company name as publisher when possible.",
    href: "https://chrome.google.com/webstore/devconsole",
    hrefLabel: "Open developer console",
    youMustDo: true,
  },
  {
    id: "cws-listing",
    title: "3b. Upload the extension listing",
    detail:
      "Zip is at /downloads/fighur-page-theme.zip. Use the store listing draft for copy, privacy URL, and screenshots. Submit for review.",
    href: "/downloads/chrome-store-listing.txt",
    hrefLabel: "Download listing draft",
    youMustDo: true,
  },
  {
    id: "add-to-chrome",
    title: "3c. Point “Add to Chrome” at the Store",
    detail:
      "Done — /extension and Settings → Apps link to the live Chrome Web Store listing (FIGHURAI Colors).",
    href: "https://chromewebstore.google.com/detail/fighurai-colors/kihglfamlplmecmnookmleodhgmdgnbm",
    hrefLabel: "Open Chrome Web Store",
    youMustDo: false,
  },
];

const STORAGE_KEY = "fighur-legal-checklist-v1";

export default function LegalChecklistPage() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const completed = STEPS.filter((s) => done[s.id]).length;

  return (
    <LegalShell title="Own & sell FIGHURAI Colors">
      <p>
        Checklist to make the Colors extension legally yours and sellable. Items marked{" "}
        <strong className="text-[var(--text-primary)]">You</strong> require action outside this
        codebase (entity, trademark, Chrome account). Product docs are already wired.
      </p>
      <p className="text-[0.7rem] text-[var(--text-faint)]">
        Not legal advice. Progress is saved only in this browser.
      </p>
      <p className="text-xs text-[var(--text-muted)]">
        Progress: {completed}/{STEPS.length}
      </p>

      <ul className="mt-4 space-y-3">
        {STEPS.map((step) => (
          <li
            key={step.id}
            className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(done[step.id])}
                onChange={() => toggle(step.id)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {step.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${
                      step.youMustDo
                        ? "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30"
                        : "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
                    }`}
                  >
                    {step.youMustDo ? "You" : "In product"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--text-muted)]">
                  {step.detail}
                </span>
                {step.href ? (
                  <Link
                    href={step.href}
                    target={step.href.startsWith("http") ? "_blank" : undefined}
                    rel={step.href.startsWith("http") ? "noreferrer" : undefined}
                    className="mt-2 inline-block text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {step.hrefLabel ?? step.href}
                  </Link>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-[var(--text-faint)]">
        <Link href="/eula" className="underline-offset-2 hover:underline">
          EULA
        </Link>
        {" · "}
        <Link href="/terms" className="underline-offset-2 hover:underline">
          Terms
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-2 hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link href="/extension" className="underline-offset-2 hover:underline">
          Install Colors
        </Link>
      </p>
    </LegalShell>
  );
}
