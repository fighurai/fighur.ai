"use client";

import { SettingsControls } from "@/components/settings-controls";
import { ThemeControls } from "@/components/theme-controls";

export function HeaderControls() {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <ThemeControls />
      <SettingsControls />
    </div>
  );
}
