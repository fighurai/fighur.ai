"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AgentsControls } from "@/components/agents-controls";
import { LayoutControls } from "@/components/layout-controls";
import { SettingsControls } from "@/components/settings-controls";
import { ThemeControls } from "@/components/theme-controls";

export function HeaderControls() {
  const pathname = usePathname();
  const onSettings = pathname === "/settings" || pathname?.startsWith("/settings/");

  // On Settings, keep the header quiet — section nav lives in the page.
  if (onSettings) {
    return (
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <Link
          href="/"
          className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[0.7rem] font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)] sm:hidden"
        >
          Chat
        </Link>
        <ThemeControls />
      </div>
    );
  }

  return (
    <div className="flex max-w-[min(100%,calc(100vw-4.5rem))] shrink-0 items-center justify-end gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-none sm:gap-2 [&::-webkit-scrollbar]:hidden">
      <AgentsControls />
      <LayoutControls />
      <ThemeControls />
      <SettingsControls />
    </div>
  );
}
