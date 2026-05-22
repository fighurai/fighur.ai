"use client";

/**
 * Client hook on sign-out. Per-user chats and device folders stay in scoped storage;
 * httpOnly session and OAuth cookies are cleared server-side.
 */
export async function onLogoutClientSide(): Promise<void> {
  /* Intentionally keep per-user localStorage / IndexedDB for restore on next login. */
}
