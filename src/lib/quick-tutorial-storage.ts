import { readSession } from "@/lib/auth-storage";

const KEY = "fighur-quick-tutorial-done";

export function readQuickTutorialDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeQuickTutorialDoneLocal(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Persist dismissal locally and, when signed in, on the account. */
export function persistQuickTutorialDone(): void {
  writeQuickTutorialDoneLocal();
  if (!readSession()?.userId) return;
  void fetch("/api/user/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quickTutorialDone: true }),
  }).catch(() => {
    /* ignore */
  });
}

/** Pull account preference after sign-in and mirror to localStorage. */
export async function hydrateQuickTutorialDoneFromServer(): Promise<boolean> {
  const localDone = readQuickTutorialDone();
  if (!readSession()?.userId) return localDone;
  try {
    const res = await fetch("/api/user/preferences", { cache: "no-store" });
    if (!res.ok) return localDone;
    const data = (await res.json()) as {
      preferences?: { quickTutorialDone?: boolean };
    };
    if (data.preferences?.quickTutorialDone) {
      writeQuickTutorialDoneLocal();
      return true;
    }
    // Signed-in user already dismissed locally — keep it and sync to account.
    if (localDone) {
      persistQuickTutorialDone();
      return true;
    }
  } catch {
    /* ignore */
  }
  return localDone;
}
