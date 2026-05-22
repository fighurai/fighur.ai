import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, timingSafeEqualString, unsealJson } from "@/lib/oauth-crypto";
import { isSafeUserId } from "@/lib/user-data-store";
import { attachMicrosoftConnectionCookie } from "@/lib/connection-cookies";
import { writeMicrosoftConnection } from "@/lib/user-oauth-store";

export const maxDuration = 60;

type Pending = { state: string; codeVerifier: string; t: number; userId: string };

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.redirect(new URL("/?oauth_error=missing_secret", getOAuthBaseUrl()));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  let pendingRaw: string | null = null;
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const p = part.trim();
    if (p.startsWith("smile_oauth_microsoft_pending=")) {
      pendingRaw = decodeURIComponent(p.slice("smile_oauth_microsoft_pending=".length));
      break;
    }
  }

  if (err) {
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent(err)}`, getOAuthBaseUrl()));
  }
  if (!code || !state || !pendingRaw) {
    return NextResponse.redirect(new URL("/?oauth_error=invalid_callback", getOAuthBaseUrl()));
  }

  const pending = unsealJson<Pending>(pendingRaw, secret);
  if (
    !pending?.state ||
    !pending.codeVerifier ||
    !timingSafeEqualString(pending.state, state) ||
    typeof pending.userId !== "string" ||
    !isSafeUserId(pending.userId)
  ) {
    return NextResponse.redirect(new URL("/?oauth_error=bad_state", getOAuthBaseUrl()));
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?oauth_error=missing_microsoft_env", getOAuthBaseUrl()));
  }

  const redirectUri = `${getOAuthBaseUrl()}/api/connect/microsoft/callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: pending.codeVerifier,
  });

  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const tokenJson = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenRes.ok || !tokenJson.refresh_token) {
    const msg =
      tokenJson.error_description || tokenJson.error || `token_${tokenRes.status}`;
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent(String(msg).slice(0, 200))}`, getOAuthBaseUrl()),
    );
  }

  let email: string | undefined;
  if (tokenJson.access_token) {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (me.ok) {
      const meJson = (await me.json()) as { mail?: string; userPrincipalName?: string };
      email = meJson.mail || meJson.userPrincipalName;
    }
  }

  const payload = { v: 1 as const, refresh_token: tokenJson.refresh_token, email };

  try {
    await writeMicrosoftConnection(pending.userId, payload);
  } catch {
    /* disk optional on serverless */
  }

  const res = NextResponse.redirect(new URL("/?connected=microsoft", getOAuthBaseUrl()));
  attachMicrosoftConnectionCookie(res, pending.userId, payload);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("smile_oauth_microsoft_pending", "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
