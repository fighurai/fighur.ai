"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";

import { HeaderControls } from "@/components/header-controls";
import { SiteTutorial } from "@/components/site-tutorial";
import { SITE_ICON, SITE_ICON_DISPLAY_PX, SITE_TITLE } from "@/lib/site-brand";
import { HEADER_TRIGGER_CLASS } from "@/lib/header-panel";

export function SmileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const openTutorial = useCallback(() => setTutorialOpen(true), []);

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
              onClick={openTutorial}
              className={`${HEADER_TRIGGER_CLASS} shrink-0 !px-2 !text-[var(--accent)] hover:!text-[var(--accent)] sm:!px-3`}
            >
              <span className="sm:hidden">Tutorial</span>
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
    </div>
  );
}
