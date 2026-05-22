import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie, sessionJsonBody } from "@/lib/auth-session";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { verifyPassword } from "@/lib/password-auth";
import { clientIp, userAgent } from "@/lib/request-context";
import { readUserByEmail } from "@/lib/user-data-store";
import { normalizeRoles } from "@/lib/rbac";

export async function POST(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server security secret not configured." }, { status: 503 });
  }

  let body: { email?: unknown; password?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ip = clientIp(request);
  const ua = userAgent(request);

  if (!email.includes("@") || !password) {
    return NextResponse.json({ error: "Email and password required." }, { status: 400 });
  }

  const profile = await readUserByEmail(email);
  if (!profile?.passwordHash) {
    await appendAudit({
      action: "auth.sign_in",
      outcome: "failure",
      ip,
      userAgent: ua,
      meta: { email, reason: "no_password_account" },
    });
    const hint =
      profile?.authProvider === "google" || profile?.authProvider === "microsoft"
        ? `This account uses ${profile.authProvider} sign-in.`
        : "No password account found. Create an account first.";
    return NextResponse.json({ error: hint }, { status: 401 });
  }

  const valid = await verifyPassword(password, profile.passwordHash);
  if (!valid) {
    await appendAudit({
      action: "auth.sign_in",
      outcome: "failure",
      userId: profile.userId,
      ip,
      userAgent: ua,
    });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const res = NextResponse.json(
    sessionJsonBody({
      userId: profile.userId,
      email: profile.email,
      name: profile.name,
      roles: normalizeRoles(profile.roles),
      environmentId: profile.environmentId,
    }),
  );
  const withCookie = await attachSessionCookie(res, {
    userId: profile.userId,
    email: profile.email,
    name: profile.name,
  });
  if (!withCookie) {
    return NextResponse.json({ error: "Could not create session." }, { status: 500 });
  }

  await appendAudit({
    action: "auth.sign_in",
    outcome: "success",
    userId: profile.userId,
    ip,
    userAgent: ua,
  });

  return withCookie;
}
