import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, timingSafeEqualString, unsealJson } from "@/lib/oauth-crypto";
import { isSafeUserId } from "@/lib/user-data-store";
import { attachGoogleConnectionCookie } from "@/lib/connection-cookies";
import { writeGoogleConnection } from "@/lib/user-oauth-store";

export const maxDuration = 60;

type Pending = { state: string; codeVerifier: string; t: number; userId: string };

function decodeIdTokenEmail(idToken: string | undefined): string | undefined {
  if (!idToken || typeof idToken !== "string") return undefined;
  const parts = idToken.split(".");
  if (parts.length < 2) return undefined;
  try {
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { email?: string };
    return typeof json.email === "string" ? json.email : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.redirect(new URL("/?oauth_error=missing_secret", getOAuthBaseUrl()));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const cookieHeader = request.headers.get("cookie") ?? "";
  let pendingRaw: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const p = part.trim();
    if (p.startsWith("smile_oauth_google_pending=")) {
      pendingRaw = decodeURIComponent(p.slice("smile_oauth_google_pending=".length));
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

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?oauth_error=missing_google_env", getOAuthBaseUrl()));
  }

  const redirectUri = `${getOAuthBaseUrl()}/api/connect/google/callback`;
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
    body: body.toString(),
  });

  const tokenJson = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
    error?: string;
  };

  if (!tokenRes.ok || !tokenJson.refresh_token) {
    const msg = tokenJson.error || `token_${tokenRes.status}`;
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent(msg)}`, getOAuthBaseUrl()));
  }

  const email = decodeIdTokenEmail(tokenJson.id_token);
  const payload = { v: 1 as const, refresh_token: tokenJson.refresh_token, email };

  try {
    await writeGoogleConnection(pending.userId, payload);
  } catch {
    /* disk optional on serverless — encrypted cookie below */
  }

  const res = NextResponse.redirect(new URL("/?connected=google", getOAuthBaseUrl()));
  attachGoogleConnectionCookie(res, pending.userId, payload);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("smile_oauth_google_pending", "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
