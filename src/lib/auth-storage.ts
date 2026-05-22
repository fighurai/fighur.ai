export type SmileSession = {
  /** Stable server-side user id (UUID); set after sign-in / sign-up. */
  userId?: string;
  email: string;
  name?: string;
  roles?: string[];
  environmentId?: string;
  plan?: "free" | "pro";
};

export type UsageSummary = {
  signedIn: boolean;
  spentUsd: number;
  limitUsd: number | null;
  remainingUsd: number | null;
  signupRequired: boolean;
  environmentId: string | null;
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
      const roles = (parsed as { roles?: unknown }).roles;
      const environmentId = (parsed as { environmentId?: unknown }).environmentId;
      const plan = (parsed as { plan?: unknown }).plan;
      return {
        email,
        name: typeof name === "string" ? name.trim() || undefined : undefined,
        userId: typeof userId === "string" && userId.length > 0 ? userId : undefined,
        roles: Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : undefined,
        environmentId:
          typeof environmentId === "string" && environmentId.length > 0 ? environmentId : undefined,
        plan: plan === "pro" || plan === "free" ? plan : undefined,
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

async function persistSessionFromResponse(res: Response): Promise<boolean> {
  if (!res.ok) return false;
  const data = (await res.json()) as {
    userId?: string;
    email?: string;
    name?: string;
    roles?: string[];
    environmentId?: string;
    plan?: "free" | "pro";
  };
  if (typeof data.userId !== "string" || typeof data.email !== "string") return false;
  writeSession({
    userId: data.userId,
    email: data.email,
    name: data.name,
    roles: data.roles,
    environmentId: data.environmentId,
    plan: data.plan === "pro" ? "pro" : "free",
  });
  return true;
}

/** Demo-only email session (disabled unless SMILE_ALLOW_DEMO_EMAIL_AUTH=true). */
export async function establishServerSession(body: { email: string; name?: string }): Promise<boolean> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return persistSessionFromResponse(res);
}

export async function signUpWithPassword(body: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/auth/sign-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error || "Sign up failed." };
  }
  const ok = await persistSessionFromResponse(res);
  return ok ? { ok: true } : { ok: false, error: "Could not persist session." };
}

export async function signInWithPassword(body: {
  email: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error || "Sign in failed." };
  }
  const ok = await persistSessionFromResponse(res);
  return ok ? { ok: true } : { ok: false, error: "Could not persist session." };
}

export async function fetchUsageSummary(): Promise<UsageSummary | null> {
  try {
    const res = await fetch("/api/usage", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as UsageSummary;
  } catch {
    return null;
  }
}

/** Sync httpOnly session cookie → localStorage (after SSO redirect or page load). */
export async function hydrateServerSession(): Promise<boolean> {
  const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
  if (res.ok) {
    const data = (await res.json()) as {
      signedIn?: boolean;
      userId?: string;
      email?: string;
      name?: string;
      plan?: string;
    };
    if (data.signedIn && data.userId && data.email) {
      writeSession({
        userId: data.userId,
        email: data.email,
        name: data.name,
        roles: Array.isArray((data as { roles?: unknown }).roles)
          ? ((data as { roles: string[] }).roles)
          : undefined,
        environmentId:
          typeof (data as { environmentId?: unknown }).environmentId === "string"
            ? (data as { environmentId: string }).environmentId
            : data.userId,
        plan: data.plan === "pro" ? "pro" : "free",
      });
      return true;
    }
  }
  return false;
}

export async function clearSessionAndServer(): Promise<void> {
  const { onLogoutClientSide } = await import("@/lib/client-auth-cleanup");
  await onLogoutClientSide();
  clearSession();
  try {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
}
