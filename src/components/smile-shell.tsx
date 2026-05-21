"use client";

import Image from "next/image";

import { HeaderControls } from "@/components/header-controls";

export function SmileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-deep)]">
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-white/[0.06] bg-[var(--bg-deep)]/95 backdrop-blur-xl">
        <div className="flex h-[3.25rem] w-full items-center justify-between px-2 sm:px-3">
          <Image
            src="/images/smile-logo-transparent.png"
            alt="Smile AI"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            priority
          />
          <HeaderControls />
        </div>
      </header>
      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col pt-[3.25rem]">
        {children}
      </main>
    </div>
  );
}
