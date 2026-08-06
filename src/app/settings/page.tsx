import { Suspense } from "react";

import { SettingsPageClient } from "@/components/settings/settings-page-client";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-10 text-sm text-[var(--text-muted)]">Loading settings…</div>
      }
    >
      <SettingsPageClient />
    </Suspense>
  );
}
