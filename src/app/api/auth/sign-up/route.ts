import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie, sessionJsonBody } from "@/lib/auth-session";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { hashPassword, validatePasswordStrength } from "@/lib/password-auth";
import { clientIp, userAgent } from "@/lib/request-context";
import { ensureUser, readUserByEmail } from "@/lib/user-data-store";

export async function POST(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server security secret not configured." }, { status: 503 });
  }

  let body: { email?: unknown; password?: unknown; name?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

  if (!email.includes("@") || email.length > 320) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }

  const pwError = validatePasswordStrength(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  const existing = await readUserByEmail(email);
  if (existing?.passwordHash) {
    return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
  }

  const ip = clientIp(request);
  const ua = userAgent(request);

  try {
    const passwordHash = await hashPassword(password);
    const { userId } = await ensureUser(email, {
      name,
      passwordHash,
      authProvider: "email",
      emailVerified: false,
    });

    const res = NextResponse.json(
      sessionJsonBody({ userId, email, name, environmentId: userId }),
    );
    const withCookie = await attachSessionCookie(res, { userId, email, name });
    if (!withCookie) {
      return NextResponse.json({ error: "Could not create session." }, { status: 500 });
    }

    await appendAudit({
      action: "auth.sign_up",
      outcome: "success",
      userId,
      ip,
      userAgent: ua,
      resource: "account",
    });

    return withCookie;
  } catch {
    await appendAudit({
      action: "auth.sign_up",
      outcome: "failure",
      ip,
      userAgent: ua,
      resource: "account",
      meta: { email },
    });
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }
}
