import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie, sessionJsonBody } from "@/lib/auth-session";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { clientIp, userAgent } from "@/lib/request-context";
import { readVerifiedSession } from "@/lib/session-cookie";
import { ensureUser, readUserProfile } from "@/lib/user-data-store";
import { normalizeRoles } from "@/lib/rbac";

function demoEmailAuthEnabled(): boolean {
  return process.env.SMILE_ALLOW_DEMO_EMAIL_AUTH === "true";
}

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Server sealing secret not configured (SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET, 16+ chars)." },
      { status: 503 },
    );
  }

  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json({ ok: false, signedIn: false }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    signedIn: true,
    userId: session.userId,
    email: session.email,
    name: session.name,
    roles: normalizeRoles(session.roles),
    environmentId: session.environmentId ?? session.userId,
    plan: session.plan ?? "free",
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

  if (!demoEmailAuthEnabled()) {
    return NextResponse.json(
      {
        error:
          "Email-only sign-in is disabled. Use /sign-up with a password or SSO (Google / Microsoft).",
      },
      { status: 403 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (!email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const ip = clientIp(request);
  const ua = userAgent(request);

  let userId: string;
  try {
    const u = await ensureUser(email, { name, authProvider: "email" });
    userId = u.userId;
  } catch {
    return NextResponse.json({ error: "Could not create user storage" }, { status: 500 });
  }

  const profile = await readUserProfile(userId);
  const res = NextResponse.json(
    sessionJsonBody({
      userId,
      email: profile?.email ?? email,
      name: profile?.name ?? name,
      roles: normalizeRoles(profile?.roles),
      environmentId: profile?.environmentId ?? userId,
      plan: profile?.plan ?? "free",
    }),
  );
  const withCookie = await attachSessionCookie(res, {
    userId,
    email: profile?.email ?? email,
    name: profile?.name ?? name,
  });
  if (!withCookie) {
    return NextResponse.json({ error: "Could not seal session" }, { status: 500 });
  }

  await appendAudit({
    action: "auth.sign_in",
    outcome: "success",
    userId,
    ip,
    userAgent: ua,
    meta: { demo: true },
  });

  return withCookie;
}
