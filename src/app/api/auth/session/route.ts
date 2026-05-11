import { NextResponse } from "next/server";

import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { COOKIE_SESSION, readSessionPayload, sealSessionPayload, type SmileServerSession } from "@/lib/session-cookie";
import { ensureUser, readUserProfile } from "@/lib/user-data-store";

const SESSION_MAX_AGE = 60 * 60 * 24 * 60;

function cookieOpts() {
  const secure = process.env.NODE_ENV === "production";
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE };
}

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Server sealing secret not configured (SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET, 16+ chars)." },
      { status: 503 },
    );
  }

  const raw = readSessionPayload(request);
  if (!raw) {
    return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });
  }

  const profile = await readUserProfile(raw.userId);
  if (!profile || profile.email.trim().toLowerCase() !== raw.email.trim().toLowerCase()) {
    return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    signedIn: true,
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
  });
}

export async function POST(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Set SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET (16+ chars) for secure sessions." },
      { status: 503 },
    );
  }

  let body: { email?: unknown; name?: unknown } = {};
  try {
    body = (await request.json()) as { email?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (!email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  let userId: string;
  try {
    const u = await ensureUser(email, name);
    userId = u.userId;
  } catch {
    return NextResponse.json({ error: "Could not create user storage" }, { status: 500 });
  }

  const profile = await readUserProfile(userId);
  const sessionPayload: SmileServerSession = {
    v: 1,
    userId,
    email: profile?.email ?? email,
    name: profile?.name ?? name,
    iat: Date.now(),
  };

  const sealed = sealSessionPayload(sessionPayload);
  if (!sealed) {
    return NextResponse.json({ error: "Could not seal session" }, { status: 500 });
  }

  const res = NextResponse.json({
    ok: true,
    userId,
    email: sessionPayload.email,
    name: sessionPayload.name,
  });
  res.cookies.set(COOKIE_SESSION, sealed, cookieOpts());
  return res;
}
