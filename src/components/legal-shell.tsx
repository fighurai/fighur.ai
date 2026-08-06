import Link from "next/link";

import { SITE_TITLE } from "@/lib/site-brand";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--bg-deep)] text-[var(--text-primary)]">
      <header className="border-b border-white/[0.06] bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[3.25rem] max-w-3xl items-center justify-between px-4">
          <Link
            href="/"
            className="font-display text-sm font-semibold tracking-[0.04em] text-white transition hover:text-[var(--accent)]"
          >
            {SITE_TITLE}
          </Link>
          <nav className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <Link href="/privacy" className="hover:text-[var(--text-primary)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--text-primary)]">
              Terms
            </Link>
            <Link href="/support" className="hover:text-[var(--text-primary)]">
              Support
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <div className="legal-prose mt-8 space-y-5 text-sm leading-relaxed text-[var(--text-muted)]">
          {children}
        </div>
      </main>
      <footer className="border-t border-white/[0.06] py-6 text-center text-[0.65rem] text-[var(--text-faint)]">
        © {new Date().getFullYear()} {SITE_TITLE} ·{" "}
        <Link href="/privacy" className="hover:text-[var(--text-muted)]">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="hover:text-[var(--text-muted)]">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/support" className="hover:text-[var(--text-muted)]">
          Support
        </Link>
      </footer>
    </div>
  );
}
