import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, randomState, sealJson } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Calendars.Read",
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

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Set MICROSOFT_CLIENT_ID (Azure app registration) in the server environment." },
      { status: 503 },
    );
  }

  const state = randomState();
  const codeVerifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const pending = sealJson(
    { state, codeVerifier, t: Date.now(), userId: session.userId } satisfies Pending,
    secret,
  );

  const redirectUri = `${getOAuthBaseUrl()}/api/connect/microsoft/callback`;
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_mode", "query");

  const res = NextResponse.redirect(url.toString());
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("smile_oauth_microsoft_pending", pending, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
