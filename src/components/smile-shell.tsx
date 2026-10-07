"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { HeaderControls } from "@/components/header-controls";
import { PresenceBeacon } from "@/components/presence-beacon";
import { SiteTutorial } from "@/components/site-tutorial";
import { configureNativeChrome, syncNativeStatusBar } from "@/lib/native-bridge";
import { SITE_ICON, SITE_ICON_DISPLAY_PX, SITE_TITLE } from "@/lib/site-brand";

export function SmileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [tutorialOpen, setTutorialOpen] = useState(false);

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
      <header className="fixed inset-x-0 top-0 z-[100] overflow-visible border-b border-white/20 bg-[var(--bg-deep)]">
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
              className="inline-flex h-7 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/15 px-2.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-white/50 sm:h-8 sm:px-3"
              aria-label="Open chats"
              onClick={() => window.dispatchEvent(new CustomEvent("smile-open-chats"))}
            >
              Chats
            </button>
          </div>
          <HeaderControls />
        </div>
      </header>
      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-[3.25rem]">
        {children}
      </main>
      <SiteTutorial open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <Suspense fallback={null}>
        <PresenceBeacon />
      </Suspense>
    </div>
  );
}
