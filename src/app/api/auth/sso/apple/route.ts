import { NextResponse } from "next/server";

import { isAppleSsoConfigured, appleServicesId, appleAuthAuthorizeUrl, randomNonce } from "@/lib/apple-auth";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, randomState, sealJson } from "@/lib/oauth-crypto";

const PENDING_COOKIE = "smile_sso_apple_pending";

type Pending = { state: string; nonce: string; t: number };

export async function GET() {
  const secret = getAppSealingSecret();
  const base = getOAuthBaseUrl();
  if (!secret) {
    return NextResponse.json({ error: "Server security secret not configured." }, { status: 503 });
  }
  if (!isAppleSsoConfigured()) {
    return NextResponse.redirect(new URL("/sign-in?error=apple_not_configured", base));
  }

  const clientId = appleServicesId();
  if (!clientId) {
    return NextResponse.redirect(new URL("/sign-in?error=apple_services_id", base));
  }

  const state = randomState();
  const nonce = randomNonce();
  const pending = sealJson({ state, nonce, t: Date.now() } satisfies Pending, secret);
  const redirectUri = `${base}/api/auth/sso/apple/callback`;
  const url = appleAuthAuthorizeUrl({ clientId, redirectUri, state, nonce });

  const res = NextResponse.redirect(url);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(PENDING_COOKIE, pending, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
