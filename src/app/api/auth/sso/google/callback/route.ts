import { NextResponse } from "next/server";

import { appendAudit } from "@/lib/audit-log";
import { attachSessionCookie } from "@/lib/auth-session";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, timingSafeEqualString, unsealJson } from "@/lib/oauth-crypto";
import { clientIp, userAgent } from "@/lib/request-context";
import { ensureUser } from "@/lib/user-data-store";

const PENDING_COOKIE = "smile_sso_google_pending";

type Pending = { state: string; codeVerifier: string; t: number; mode: "signin" };

function decodeIdTokenClaims(idToken: string | undefined): {
  email?: string;
  sub?: string;
  name?: string;
} {
  if (!idToken) return {};
  const parts = idToken.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      email?: string;
      sub?: string;
      name?: string;
    };
  } catch {
    return {};
  }
}

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

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_google_env", base));
  }

  const redirectUri = `${base}/api/auth/sso/google/callback`;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: pending.codeVerifier,
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/sign-in?error=token_exchange", base));
  }

  const tokens = (await tokenRes.json()) as { id_token?: string };
  const claims = decodeIdTokenClaims(tokens.id_token);
  const email = claims.email?.trim().toLowerCase();
  if (!email?.includes("@") || !claims.sub) {
    return NextResponse.redirect(new URL("/sign-in?error=no_email", base));
  }

  const { userId } = await ensureUser(email, {
    name: claims.name,
    authProvider: "google",
    ssoSubject: { provider: "google", subject: claims.sub },
    emailVerified: true,
  });

  const res = NextResponse.redirect(new URL("/?signed_in=1", base));
  res.cookies.delete(PENDING_COOKIE);
  const withCookie = await attachSessionCookie(res, {
    userId,
    email,
    name: claims.name,
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
    resource: "google",
  });

  return withCookie;
}
