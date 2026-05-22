import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie } from "@/lib/auth-session";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, timingSafeEqualString, unsealJson } from "@/lib/oauth-crypto";
import { clientIp, userAgent } from "@/lib/request-context";
import { ensureUser } from "@/lib/user-data-store";

const PENDING_COOKIE = "smile_sso_microsoft_pending";

type Pending = { state: string; codeVerifier: string; t: number };

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

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  const base = getOAuthBaseUrl();
  const ip = clientIp(request);
  const ua = userAgent(request);

  if (!secret) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_secret", base));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const pendingRaw = readPendingCookie(request);

  if (err) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(err)}`, base));
  }
  if (!code || !state || !pendingRaw) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_callback", base));
  }

  const pending = unsealJson<Pending>(pendingRaw, secret);
  if (!pending?.state || !pending.codeVerifier || !timingSafeEqualString(pending.state, state)) {
    return NextResponse.redirect(new URL("/sign-in?error=bad_state", base));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_microsoft_env", base));
  }

  const redirectUri = `${base}/api/auth/sso/microsoft/callback`;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: pending.codeVerifier,
  });

  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/sign-in?error=token_exchange", base));
  }

  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) {
    return NextResponse.redirect(new URL("/sign-in?error=no_token", base));
  }

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.redirect(new URL("/sign-in?error=profile", base));
  }

  const me = (await meRes.json()) as { id?: string; mail?: string; userPrincipalName?: string; displayName?: string };
  const email = (me.mail || me.userPrincipalName || "").trim().toLowerCase();
  if (!email.includes("@") || !me.id) {
    return NextResponse.redirect(new URL("/sign-in?error=no_email", base));
  }

  const { userId } = await ensureUser(email, {
    name: me.displayName,
    authProvider: "microsoft",
    ssoSubject: { provider: "microsoft", subject: me.id },
    emailVerified: true,
  });

  const res = NextResponse.redirect(new URL("/?signed_in=1", base));
  res.cookies.delete(PENDING_COOKIE);
  const withCookie = await attachSessionCookie(res, {
    userId,
    email,
    name: me.displayName,
  });
  if (!withCookie) {
    return NextResponse.redirect(new URL("/sign-in?error=session", base));
  }

  await appendAudit({
    action: "auth.sign_in_sso",
    outcome: "success",
    userId,
    ip,
    userAgent: ua,
    resource: "microsoft",
  });

  return withCookie;
}
