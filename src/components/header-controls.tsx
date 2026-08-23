"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { AgentsControls } from "@/components/agents-controls";
import { LayoutControls } from "@/components/layout-controls";
import { SettingsControls } from "@/components/settings-controls";
import { ThemeControls } from "@/components/theme-controls";
import { hydrateServerSession, readSession } from "@/lib/auth-storage";
import { HEADER_TRIGGER_CLASS } from "@/lib/header-panel";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

function AdminPeopleLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const sync = () => setShow(isPlatformAdminEmail(readSession()?.email));
    sync();
    void hydrateServerSession().then(sync);
    window.addEventListener("smile-auth-changed", sync);
    return () => window.removeEventListener("smile-auth-changed", sync);
  }, []);
  if (!show) return null;
  return (
    <Link href="/admin" className={HEADER_TRIGGER_CLASS}>
      People
    </Link>
  );
}

export function HeaderControls() {
  const pathname = usePathname();
  const onSettings = pathname === "/settings" || pathname?.startsWith("/settings/");
  const onAdmin = pathname === "/admin" || pathname?.startsWith("/admin/");

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
        <AdminPeopleLink />
        <ThemeControls />
      </div>
    );
  }

  if (onAdmin) {
    return (
      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
        <Link
          href="/"
          className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[0.7rem] font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          Chat
        </Link>
        <ThemeControls />
      </div>
    );
  }

  // Do NOT use overflow-x-auto here — it clips absolute/fixed dropdowns on iOS.
  return (
    <div className="flex min-w-0 shrink items-center justify-end gap-1 sm:gap-2">
      <AgentsControls />
      <LayoutControls />
      <ThemeControls />
      <AdminPeopleLink />
      <SettingsControls />
    </div>
  );
}
