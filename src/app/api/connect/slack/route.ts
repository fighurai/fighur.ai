import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, randomState, sealJson } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";

/** User token scopes (Sign in with Slack style). */
const USER_SCOPE = "openid,email,profile";

type Pending = { state: string; t: number; userId: string };

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

  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Set SLACK_CLIENT_ID from api.slack.com → Your App → OAuth & Permissions." },
      { status: 503 },
    );
  }

  const state = randomState();
  const pending = sealJson({ state, t: Date.now(), userId: session.userId } satisfies Pending, secret);
  const redirectUri = `${getOAuthBaseUrl()}/api/connect/slack/callback`;

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("user_scope", USER_SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("smile_oauth_slack_pending", pending, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
