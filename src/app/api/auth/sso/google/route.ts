import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { isGoogleSsoConfigured } from "@/lib/auth-providers";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, randomState, sealJson } from "@/lib/oauth-crypto";

const SCOPES = ["openid", "email", "profile"].join(" ");
const PENDING_COOKIE = "smile_sso_google_pending";

type Pending = { state: string; codeVerifier: string; t: number; mode: "signin" };

export async function GET() {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server security secret not configured." }, { status: 503 });
  }

  if (!isGoogleSsoConfigured()) {
    const base = getOAuthBaseUrl();
    return NextResponse.redirect(
      new URL("/sign-in?error=google_not_configured", base),
    );
  }
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();

  const state = randomState();
  const codeVerifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const pending = sealJson(
    { state, codeVerifier, t: Date.now(), mode: "signin" } satisfies Pending,
    secret,
  );

  const redirectUri = `${getOAuthBaseUrl()}/api/auth/sso/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url.toString());
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
