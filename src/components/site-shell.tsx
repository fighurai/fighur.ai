"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeControls } from "@/components/theme-controls";
import { BOOKING_URL } from "@/lib/site-links";

const tabs = [
  { href: "/", label: "Ask" },
  ] as const;

function tabActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-deep)]">
      <header className="fixed inset-x-0 top-0 z-[100] flex shrink-0 flex-col border-b border-white/[0.06] bg-[var(--bg-deep)]/95 backdrop-blur-xl sm:h-[3.25rem]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2 sm:h-full sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-0">
          <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <Link
              href="/"
              className="shrink-0 font-display text-lg tracking-tight text-[var(--text-primary)] transition hover:text-[var(--accent)] sm:text-xl"
            >
              Smile AI
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:hidden">
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
              >
                Book
              </a>
              <ThemeControls />
            </div>
          </div>

          <nav
            className="-mx-1 flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto px-1 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:py-1 [&::-webkit-scrollbar]:hidden"
            aria-label="Site sections"
          >
            {tabs.map((t) => {
              const active = tabActive(pathname, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
                    active
                      ? "bg-white/[0.1] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
                  }`}
                  prefetch
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
            >
              Book
            </a>
            <ThemeControls />
          </div>
        </div>
      </header>

      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col pt-[calc(6.75rem+env(safe-area-inset-top,0px))] sm:pt-[3.25rem]">
        {children}
      </main>
    </div>
  );
}
