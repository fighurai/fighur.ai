import { getAppSealingSecret, sealJson, unsealJson } from "@/lib/oauth-crypto";
import { normalizeRoles } from "@/lib/rbac";
import { usesEphemeralUserStorage } from "@/lib/serverless-storage";
import { isSafeUserId, readUserProfile, type UserPlan } from "@/lib/user-data-store";

export const COOKIE_SESSION = "smile_session";

export type SmileServerSession = {
  v: 1;
  userId: string;
  email: string;
  name?: string;
  iat: number;
  roles?: string[];
  environmentId?: string;
  plan?: UserPlan;
};

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const p = part.trim();
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export function readSessionPayload(request: Request): SmileServerSession | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const raw = readCookie(request, COOKIE_SESSION);
  if (!raw) return null;
  const p = unsealJson<SmileServerSession>(raw, secret);
  if (!p || p.v !== 1 || typeof p.userId !== "string" || typeof p.email !== "string") return null;
  if (!isSafeUserId(p.userId)) return null;
  const email = p.email.trim().toLowerCase();
  if (!email.includes("@")) return null;
  return { ...p, email };
}

/** Validates cookie; uses on-disk profile when available, else sealed cookie on serverless. */
export async function readVerifiedSession(request: Request): Promise<SmileServerSession | null> {
  const p = readSessionPayload(request);
  if (!p) return null;
  const profile = await readUserProfile(p.userId);
  if (profile && profile.email.trim().toLowerCase() === p.email.trim().toLowerCase()) {
    return {
      ...p,
      name: profile.name ?? p.name,
      roles: normalizeRoles(profile.roles),
      environmentId: profile.environmentId ?? p.userId,
      plan: profile.plan,
    };
  }
  if (usesEphemeralUserStorage()) {
    return {
      ...p,
      roles: normalizeRoles(p.roles),
      environmentId: p.environmentId ?? p.userId,
      plan: p.plan === "pro" ? "pro" : "free",
    };
  }
  return null;
}

export function sealSessionPayload(payload: SmileServerSession): string | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  return sealJson(payload, secret);
}
