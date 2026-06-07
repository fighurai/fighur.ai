import { NextResponse } from "next/server";

import { normalizeRoles } from "@/lib/rbac";
import {
  COOKIE_SESSION,
  sealSessionPayload,
  type SmileServerSession,
} from "@/lib/session-cookie";
import { attachOAuthCookiesFromUserStore } from "@/lib/oauth-session-sync";
import { repairUserProfileForSession, readUserProfile, ensureComplimentaryEntitlements, type UserPlan } from "@/lib/user-data-store";
import { usesBlobUserStorage } from "@/lib/user-file-storage";

const SESSION_MAX_AGE = 60 * 60 * 24 * 60;

export function sessionCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE };
}

export type SessionAttachPayload = Omit<SmileServerSession, "v" | "iat"> & {
  roles?: string[];
  environmentId?: string;
  plan?: UserPlan;
};

export async function attachSessionCookie(
  res: NextResponse,
  payload: SessionAttachPayload,
): Promise<NextResponse | null> {
  if (usesBlobUserStorage()) {
    await repairUserProfileForSession({
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
    });
  }
  await ensureComplimentaryEntitlements(payload.userId, payload.email);
  const profile = await readUserProfile(payload.userId);
  const sessionPayload: SmileServerSession = {
    v: 1,
    userId: payload.userId,
    email: profile?.email ?? payload.email,
    name: profile?.name ?? payload.name,
    iat: Date.now(),
    roles: normalizeRoles(profile?.roles ?? payload.roles),
    environmentId: profile?.environmentId ?? payload.environmentId ?? payload.userId,
    plan: profile?.plan ?? payload.plan ?? "free",
  };
  const sealed = sealSessionPayload(sessionPayload);
  if (!sealed) return null;
  res.cookies.set(COOKIE_SESSION, sealed, sessionCookieOptions());
  await attachOAuthCookiesFromUserStore(res, sessionPayload.userId);
  return res;
}

export function sessionJsonBody(profile: {
  userId: string;
  email: string;
  name?: string;
  roles?: string[];
  environmentId?: string;
  plan?: string;
}) {
  return {
    ok: true,
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
    roles: profile.roles,
    environmentId: profile.environmentId ?? profile.userId,
    plan: profile.plan ?? "free",
  };
}
