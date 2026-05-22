import { NextResponse } from "next/server";

import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret, timingSafeEqualString, unsealJson } from "@/lib/oauth-crypto";
import { isSafeUserId } from "@/lib/user-data-store";
import { attachSlackConnectionCookie } from "@/lib/connection-cookies";
import { writeSlackConnection } from "@/lib/user-oauth-store";

export const maxDuration = 60;

type Pending = { state: string; t: number; userId: string };

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
    if (p.startsWith("smile_oauth_slack_pending=")) {
      pendingRaw = decodeURIComponent(p.slice("smile_oauth_slack_pending=".length));
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
    !timingSafeEqualString(pending.state, state) ||
    typeof pending.userId !== "string" ||
    !isSafeUserId(pending.userId)
  ) {
    return NextResponse.redirect(new URL("/?oauth_error=bad_state", getOAuthBaseUrl()));
  }

  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?oauth_error=missing_slack_env", getOAuthBaseUrl()));
  }

  const redirectUri = `${getOAuthBaseUrl()}/api/connect/slack/callback`;
  const body = new FormData();
  body.set("code", code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", redirectUri);

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    body,
  });

  const tokenJson = (await tokenRes.json()) as {
    ok?: boolean;
    error?: string;
    authed_user?: { access_token?: string; id?: string };
    team?: { name?: string };
  };

  if (!tokenJson.ok || !tokenJson.authed_user?.access_token) {
    const msg = tokenJson.error || "slack_oauth_failed";
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent(msg)}`, getOAuthBaseUrl()));
  }

  const accessToken = tokenJson.authed_user.access_token;
  let email: string | undefined;
  try {
    const idRes = await fetch("https://slack.com/api/openid.connect.userInfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (idRes.ok) {
      const idJson = (await idRes.json()) as { email?: string };
      email = idJson.email;
    }
  } catch {
    /* optional */
  }

  const payload = {
    v: 1 as const,
    access_token: accessToken,
    email,
    team_name: tokenJson.team?.name,
  };

  try {
    await writeSlackConnection(pending.userId, payload);
  } catch {
    /* disk optional on serverless */
  }

  const res = NextResponse.redirect(new URL("/?connected=slack", getOAuthBaseUrl()));
  attachSlackConnectionCookie(res, pending.userId, payload);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set("smile_oauth_slack_pending", "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
