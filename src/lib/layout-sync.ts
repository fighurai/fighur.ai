import { readSession } from "@/lib/auth-storage";
import type { LayoutPrefs } from "@/lib/layout-storage";

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced PUT of layout prefs for signed-in users. */
export function syncLayoutToServer(layout: LayoutPrefs, debounceMs = 450) {
  if (!readSession()?.userId) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void fetch("/api/user/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    }).catch(() => {
      /* ignore */
    });
  }, debounceMs);
}
