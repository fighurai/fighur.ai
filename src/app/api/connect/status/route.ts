import { NextResponse } from "next/server";

import { getAppSealingSecret, unsealJson } from "@/lib/oauth-crypto";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";
import {
  COOKIE_GOOGLE,
  COOKIE_MICROSOFT,
  COOKIE_SLACK,
  getCookieOAuthIntegrationFlags,
} from "@/lib/oauth-connection-cookies";
import type { GoogleCookiePayload, MicrosoftCookiePayload, SlackCookiePayload } from "@/lib/oauth-payload-types";
import { readVerifiedSession } from "@/lib/session-cookie";
import {
  readGoogleFromStore,
  readMicrosoftFromStore,
  readSlackFromStore,
} from "@/lib/user-oauth-store";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const p = part.trim();
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({
      configured: false,
      signedIn: false,
      google: { connected: false },
      microsoft: { connected: false },
      slack: { connected: false },
      hint: "Set SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET (16+ chars) and provider client IDs to enable OAuth.",
    });
  }

  const session = await readVerifiedSession(request);
  const signedIn = Boolean(session);

  let googleEmail: string | undefined;
  let googleConnected = false;
  let microsoftEmail: string | undefined;
  let microsoftConnected = false;
  let slackEmail: string | undefined;
  let slackTeam: string | undefined;
  let slackConnected = false;

  if (session) {
    const g = await readGoogleFromStore(session.userId, secret);
    if (g) {
      googleConnected = true;
      googleEmail = g.email;
    }
    const m = await readMicrosoftFromStore(session.userId, secret);
    if (m) {
      microsoftConnected = true;
      microsoftEmail = m.email;
    }
    const s = await readSlackFromStore(session.userId, secret);
    if (s) {
      slackConnected = true;
      slackEmail = s.email;
      slackTeam = s.team_name;
    }
  } else {
    const g = readCookie(request, COOKIE_GOOGLE);
    if (g) {
      const p = unsealJson<GoogleCookiePayload>(g, secret);
      if (p?.v === 1 && typeof p.refresh_token === "string" && p.refresh_token.length > 0) {
        googleConnected = true;
        googleEmail = p.email;
      }
    }
    const m = readCookie(request, COOKIE_MICROSOFT);
    if (m) {
      const p = unsealJson<MicrosoftCookiePayload>(m, secret);
      if (p?.v === 1 && typeof p.refresh_token === "string" && p.refresh_token.length > 0) {
        microsoftConnected = true;
        microsoftEmail = p.email;
      }
    }
    const s = readCookie(request, COOKIE_SLACK);
    if (s) {
      const p = unsealJson<SlackCookiePayload>(s, secret);
      if (p?.v === 1 && typeof p.access_token === "string" && p.access_token.length > 0) {
        slackConnected = true;
        slackEmail = p.email;
        slackTeam = p.team_name;
      }
    }
  }

  const cookieLegacy: Partial<ChatIntegrationFlags> = signedIn
    ? {}
    : getCookieOAuthIntegrationFlags(request, secret);
  const hasLegacy = Boolean(
    cookieLegacy.gmail || cookieLegacy.outlook || cookieLegacy.slack || cookieLegacy.microsoft365,
  );

  return NextResponse.json({
    configured: true,
    signedIn,
    needsSignInForConnect: !signedIn,
    google: { connected: googleConnected, email: googleEmail },
    microsoft: { connected: microsoftConnected, email: microsoftEmail },
    slack: { connected: slackConnected, email: slackEmail, team: slackTeam },
    ...(hasLegacy && !signedIn
      ? {
          hint: "Sign in to link integrations to your account. Legacy browser-only tokens are in use until you reconnect.",
        }
      : !signedIn
        ? { hint: "Sign in so connections are stored in your private server folder." }
        : {}),
  });
}
