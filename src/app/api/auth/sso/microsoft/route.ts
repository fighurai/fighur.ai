import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, randomState, sealJson } from "@/lib/oauth-crypto";

const SCOPES = ["openid", "email", "profile", "offline_access", "User.Read"].join(" ");
const PENDING_COOKIE = "smile_sso_microsoft_pending";

type Pending = { state: string; codeVerifier: string; t: number };

export async function GET() {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({ error: "Server security secret not configured." }, { status: 503 });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Microsoft SSO is not configured." }, { status: 503 });
  }

  const state = randomState();
  const codeVerifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const pending = sealJson({ state, codeVerifier, t: Date.now() } satisfies Pending, secret);

  const redirectUri = `${getOAuthBaseUrl()}/api/auth/sso/microsoft/callback`;
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

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
