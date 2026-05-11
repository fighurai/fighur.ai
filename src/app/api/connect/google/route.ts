import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, randomState, sealJson } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "offline_access",
].join(" ");

type Pending = { state: string; codeVerifier: string; t: number; userId: string };

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Set SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET (16+ chars) for secure OAuth." },
      { status: 503 },
    );
  }

  const session = await readVerifiedSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Sign in required. Connections are saved to your account on this server." },
      { status: 401 },
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Set GOOGLE_CLIENT_ID in the server environment." }, { status: 503 });
  }

  const state = randomState();
  const codeVerifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const pending = sealJson(
    { state, codeVerifier, t: Date.now(), userId: session.userId } satisfies Pending,
    secret,
  );

  const redirectUri = `${getOAuthBaseUrl()}/api/connect/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(url.toString());
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("smile_oauth_google_pending", pending, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
