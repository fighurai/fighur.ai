import { NextResponse } from "next/server";

import { isAppleSsoConfigured, verifyAppleIdToken } from "@/lib/apple-auth";
import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie } from "@/lib/auth-session";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { normalizeRoles } from "@/lib/rbac";
import { clientIp, userAgent } from "@/lib/request-context";
import { ensureUser, getPlanForEmail } from "@/lib/user-data-store";

export const maxDuration = 60;

/** Capacitor / native: POST { idToken, fullName? } → session cookie. */
export async function POST(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret || !isAppleSsoConfigured()) {
    return NextResponse.json({ error: "Apple Sign In not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { idToken?: string; fullName?: string };
    if (!body.idToken) {
      return NextResponse.json({ error: "idToken required." }, { status: 400 });
    }

    const audiences = [
      process.env.APPLE_SERVICES_ID?.trim(),
      process.env.APPLE_BUNDLE_ID?.trim() || "ai.fighur.app",
    ].filter(Boolean) as string[];

    const claims = await verifyAppleIdToken(body.idToken, audiences);

    let email = claims.email?.trim().toLowerCase();
    if (!email?.includes("@")) {
      email = `apple.${claims.sub.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}@privaterelay.appleid.com`;
    }

    const { userId } = await ensureUser(email, {
      name: body.fullName,
      authProvider: "apple",
      ssoSubject: { provider: "apple", subject: claims.sub },
      emailVerified: true,
    });

    const plan = getPlanForEmail(email);
    const res = NextResponse.json({ ok: true, userId, email, plan });
    const withCookie = await attachSessionCookie(res, {
      userId,
      email,
      name: body.fullName,
      roles: normalizeRoles(["user"]),
      environmentId: userId,
      plan,
    });
    if (!withCookie) {
      return NextResponse.json({ error: "Could not create session." }, { status: 500 });
    }

    void appendAudit({
      action: "auth.sign_in_sso",
      outcome: "success",
      userId,
      ip: clientIp(request),
      userAgent: userAgent(request),
      resource: "apple_native",
    });

    return withCookie;
  } catch (e) {
    console.error("[apple native sso]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Apple Sign In failed." },
      { status: 400 },
    );
  }
}
