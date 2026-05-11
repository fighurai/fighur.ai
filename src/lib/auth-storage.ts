export type SmileSession = {
  /** Stable server-side user id (UUID); set after POST /api/auth/session). */
  userId?: string;
  email: string;
  name?: string;
};

const STORAGE_KEY = "smile-ai-session-v1";

export function readSession(): SmileSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { email?: unknown }).email === "string"
    ) {
      const email = (parsed as { email: string }).email.trim();
      if (!email) return null;
      const name = (parsed as { name?: unknown }).name;
      const userId = (parsed as { userId?: unknown }).userId;
      return {
        email,
        name: typeof name === "string" ? name.trim() || undefined : undefined,
        userId: typeof userId === "string" && userId.length > 0 ? userId : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSession(session: SmileSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event("smile-auth-changed"));
  } catch {
    /* quota */
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("smile-auth-changed"));
  } catch {
    /* ignore */
  }
}

/** Creates server user directory + httpOnly session cookie. */
export async function establishServerSession(body: { email: string; name?: string }): Promise<boolean> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { userId?: string; email?: string; name?: string };
  if (typeof data.userId !== "string" || typeof data.email !== "string") return false;
  writeSession({ userId: data.userId, email: data.email, name: data.name });
  return true;
}

/** Sync cookie → localStorage, or POST local email to mint session (existing browser-only users). */
export async function hydrateServerSession(): Promise<void> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (res.ok) {
    const data = (await res.json()) as {
      signedIn?: boolean;
      userId?: string;
      email?: string;
      name?: string;
    };
    if (data.signedIn && data.userId && data.email) {
      writeSession({ userId: data.userId, email: data.email, name: data.name });
    }
    return;
  }
  const local = readSession();
  if (local?.email) {
    const ok = await establishServerSession({ email: local.email, name: local.name });
    if (!ok) {
      /* server offline or secret missing — keep local-only session */
    }
  }
}

export async function clearSessionAndServer(): Promise<void> {
  clearSession();
  try {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
}
