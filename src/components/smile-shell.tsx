"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { HeaderControls } from "@/components/header-controls";
import { SITE_ICON, SITE_ICON_DISPLAY_PX, SITE_TITLE } from "@/lib/site-brand";

export function SmileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-deep)]">
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-[var(--border-faint)] bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="flex h-[3.25rem] w-full items-center justify-between px-2 sm:px-3">
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
              style={{ width: SITE_ICON_DISPLAY_PX, height: SITE_ICON_DISPLAY_PX, background: "transparent" }}
              priority
            />
          </Link>
          <HeaderControls />
        </div>
      </header>
      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col pt-[3.25rem]">
        {children}
      </main>
    </div>
  );
}
