import { NextResponse } from "next/server";

import {
  appleServicesId,
  createAppleClientSecret,
  isAppleSsoConfigured,
  verifyAppleIdToken,
} from "@/lib/apple-auth";
import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie } from "@/lib/auth-session";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, timingSafeEqualString, unsealJson } from "@/lib/oauth-crypto";
import { normalizeRoles } from "@/lib/rbac";
import { clientIp, userAgent } from "@/lib/request-context";
import { ensureUser, getPlanForEmail } from "@/lib/user-data-store";

export const maxDuration = 60;

const PENDING_COOKIE = "smile_sso_apple_pending";

type Pending = { state: string; nonce: string; t: number };

function readPendingCookie(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const p = part.trim();
    if (p.startsWith(`${PENDING_COOKIE}=`)) {
      return decodeURIComponent(p.slice(PENDING_COOKIE.length + 1));
    }
  }
  return null;
}

/** Apple uses response_mode=form_post */
export async function POST(request: Request) {
  const secret = getAppSealingSecret();
  const base = getOAuthBaseUrl();
  if (!secret || !isAppleSsoConfigured()) {
    return NextResponse.redirect(new URL("/sign-in?error=apple_not_configured", base));
  }

  try {
    const form = await request.formData();
    const code = typeof form.get("code") === "string" ? String(form.get("code")) : null;
    const idToken = typeof form.get("id_token") === "string" ? String(form.get("id_token")) : null;
    const state = typeof form.get("state") === "string" ? String(form.get("state")) : null;
    const err = typeof form.get("error") === "string" ? String(form.get("error")) : null;
    const userRaw = typeof form.get("user") === "string" ? String(form.get("user")) : null;

    if (err) {
      return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(err)}`, base));
    }

    const pendingRaw = readPendingCookie(request);
    if (!idToken || !state || !pendingRaw) {
      return NextResponse.redirect(new URL("/sign-in?error=invalid_callback", base));
    }

    const pending = unsealJson<Pending>(pendingRaw, secret);
    if (!pending?.state || !timingSafeEqualString(pending.state, state)) {
      return NextResponse.redirect(new URL("/sign-in?error=bad_state", base));
    }

    const clientId = appleServicesId();
    if (!clientId) {
      return NextResponse.redirect(new URL("/sign-in?error=apple_services_id", base));
    }

    const claims = await verifyAppleIdToken(idToken, clientId);

    if (code) {
      try {
        const redirectUri = `${base}/api/auth/sso/apple/callback`;
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: await createAppleClientSecret(clientId),
        });
        await fetch("https://appleid.apple.com/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        /* id_token is enough for session */
      }
    }

    let email = claims.email?.trim().toLowerCase();
    if (!email?.includes("@")) {
      email = `apple.${claims.sub.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}@privaterelay.appleid.com`;
    }

    let userName: string | undefined;
    if (userRaw) {
      try {
        const parsed = JSON.parse(userRaw) as { name?: { firstName?: string; lastName?: string } };
        const parts = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean);
        if (parts.length) userName = parts.join(" ");
      } catch {
        /* ignore */
      }
    }

    const { userId } = await ensureUser(email, {
      name: userName,
      authProvider: "apple",
      ssoSubject: { provider: "apple", subject: claims.sub },
      emailVerified: true,
    });

    const plan = getPlanForEmail(email);
    const res = NextResponse.redirect(new URL("/?signed_in=1", base));
    res.cookies.delete(PENDING_COOKIE);
    const withCookie = await attachSessionCookie(res, {
      userId,
      email,
      name: userName,
      roles: normalizeRoles(["user"]),
      environmentId: userId,
      plan,
    });
    if (!withCookie) {
      return NextResponse.redirect(new URL("/sign-in?error=session", base));
    }

    void appendAudit({
      action: "auth.sign_in_sso",
      outcome: "success",
      userId,
      ip: clientIp(request),
      userAgent: userAgent(request),
      resource: "apple",
    });

    return withCookie;
  } catch (e) {
    console.error("[apple sso callback]", e);
    return NextResponse.redirect(new URL("/sign-in?error=sso_failed", base));
  }
}
