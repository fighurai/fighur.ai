import { NextResponse } from "next/server";

import {
  COOKIE_SESSION,
  sealSessionPayload,
  type SmileServerSession,
} from "@/lib/session-cookie";
import { readUserProfile } from "@/lib/user-data-store";

const SESSION_MAX_AGE = 60 * 60 * 24 * 60;

export function sessionCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE };
}

export async function attachSessionCookie(
  res: NextResponse,
  payload: Omit<SmileServerSession, "v" | "iat">,
): Promise<NextResponse | null> {
  const profile = await readUserProfile(payload.userId);
  const sessionPayload: SmileServerSession = {
    v: 1,
    userId: payload.userId,
    email: profile?.email ?? payload.email,
    name: profile?.name ?? payload.name,
    iat: Date.now(),
  };
  const sealed = sealSessionPayload(sessionPayload);
  if (!sealed) return null;
  res.cookies.set(COOKIE_SESSION, sealed, sessionCookieOptions());
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
