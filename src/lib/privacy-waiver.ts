"use client";

const STORAGE_PREFIX = "fighurai-privacy-waiver-v1";

export const PRIVACY_WAIVER_VERSION = 1;

export type PrivacyWaiverKind = "google" | "microsoft" | "device";

export function waiverStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function hasAcceptedPrivacyWaiver(userId: string | undefined | null): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    const raw = localStorage.getItem(waiverStorageKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { v?: number; at?: string };
    return parsed.v === PRIVACY_WAIVER_VERSION && typeof parsed.at === "string";
  } catch {
    return false;
  }
}

export function recordPrivacyWaiverAcceptance(userId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    waiverStorageKey(userId),
    JSON.stringify({ v: PRIVACY_WAIVER_VERSION, at: new Date().toISOString() }),
  );
}

export const PRIVACY_WAIVER_BODY = `By connecting integrations or a device folder, you agree that:

• FIGHURAI may access the data you authorize (Gmail, Calendar, Outlook, or files in the folder you pick) only to assist you in chat.
• Mail and calendar access is read-only on our servers — we do not send email or delete messages on your behalf without separate tools you approve.
• File organization in CoWork runs on your computer after you confirm a change list; we do not upload your full disk to our servers.
• OAuth tokens and chat data are stored under your signed-in account and are not shared with other users.
• You can disconnect anytime in Settings or sign out to clear session cookies.
• You are responsible for reviewing any file moves or renames before applying them.

This is not legal advice. Contact hello@fighurai.com for data questions or deletion requests.`;
