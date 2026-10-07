"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { HeaderControls } from "@/components/header-controls";
import { PresenceBeacon } from "@/components/presence-beacon";
import { SiteTutorial } from "@/components/site-tutorial";
import { configureNativeChrome, syncNativeStatusBar } from "@/lib/native-bridge";
import { SITE_ICON, SITE_ICON_DISPLAY_PX, SITE_TITLE } from "@/lib/site-brand";

export function SmileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const openTutorial = useCallback(() => setTutorialOpen(true), []);

  useEffect(() => {
    void configureNativeChrome();
    const onTheme = (e: Event) => {
      const bg = (e as CustomEvent<{ enabled?: boolean; bg?: string }>).detail;
      void syncNativeStatusBar(bg?.enabled ? bg.bg : "#08090d");
    };
    const onTutorial = () => setTutorialOpen(true);
    window.addEventListener("smile-theme-changed", onTheme);
    window.addEventListener("smile-open-tutorial", onTutorial);
    return () => {
      window.removeEventListener("smile-theme-changed", onTheme);
      window.removeEventListener("smile-open-tutorial", onTutorial);
    };
  }, []);

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[var(--bg-deep)]">
      <header className="fixed inset-x-0 top-0 z-[100] overflow-visible border-b border-white/[0.06] bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="flex h-[3.25rem] w-full items-center justify-between gap-2 overflow-visible px-2 sm:px-3">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <Link
              href="/"
              aria-label={`${SITE_TITLE} home`}
              className="shrink-0 rounded-lg transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              onClick={(e) => {
                if (pathname === "/") {
                  e.preventDefault();
                  window.dispatchEvent(new CustomEvent("smile-go-home"));
                }
              }}
            >
              <Image
                src={SITE_ICON}
                alt=""
                width={SITE_ICON_DISPLAY_PX}
                height={SITE_ICON_DISPLAY_PX}
                sizes={`${SITE_ICON_DISPLAY_PX}px`}
                quality={95}
                unoptimized
                className="object-contain"
                style={{
                  width: SITE_ICON_DISPLAY_PX,
                  height: SITE_ICON_DISPLAY_PX,
                  background: "transparent",
                }}
                priority
              />
            </Link>
            <button
              type="button"
              className="native-chats-btn h-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 text-xs font-medium text-[var(--text-primary)] transition hover:border-white/[0.18] sm:h-8 sm:px-3"
              aria-label="Open chats"
              onClick={() => window.dispatchEvent(new CustomEvent("smile-open-chats"))}
            >
              Chats
            </button>
            <button
              type="button"
              onClick={openTutorial}
              aria-label="Quick tutorial"
              className="native-hide-tips inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/15 px-2.5 text-[0.65rem] font-semibold leading-none text-[var(--accent)] shadow-[0_0_16px_var(--accent-glow)] transition hover:bg-[var(--accent)]/25 active:scale-95 sm:h-8 sm:px-3 sm:text-xs"
            >
              <span className="sm:hidden">Tips</span>
              <span className="hidden sm:inline">Quick tutorial</span>
            </button>
          </div>
          <HeaderControls />
        </div>
      </header>
      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pt-[3.25rem]">
        {children}
      </main>
      <SiteTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <Suspense fallback={null}>
        <PresenceBeacon />
      </Suspense>
    </div>
  );
}
