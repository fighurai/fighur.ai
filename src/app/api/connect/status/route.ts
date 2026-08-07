import { NextResponse } from "next/server";

import {
  isGoogleConnectConfigured,
  isMicrosoftConnectConfigured,
  isSlackConnectConfigured,
} from "@/lib/auth-providers";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";
import {
  readGoogleFromStore,
  readMicrosoftFromStore,
  readSlackFromStore,
} from "@/lib/user-oauth-store";

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({
      configured: false,
      signedIn: false,
      google: { connected: false, available: false },
      microsoft: { connected: false, available: false },
      slack: { connected: false, available: false },
      hint: "Set SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET (16+ chars) and provider client IDs to enable OAuth.",
    });
  }

  const session = await readVerifiedSession(request);
  const signedIn = Boolean(session);

  let googleEmail: string | undefined;
  let googleConnected = false;
  let microsoftEmail: string | undefined;
  let microsoftConnected = false;
  let slackTeam: string | undefined;
  let slackConnected = false;

  if (session) {
    const g = await readGoogleFromStore(session.userId, secret, request);
    if (g) {
      googleConnected = true;
      googleEmail = g.email;
    }
    const m = await readMicrosoftFromStore(session.userId, secret, request);
    if (m) {
      microsoftConnected = true;
      microsoftEmail = m.email;
    }
    const s = await readSlackFromStore(session.userId, secret, request);
    if (s) {
      slackConnected = true;
      slackTeam = typeof s.team_name === "string" ? s.team_name : s.email;
    }
  }

  return NextResponse.json({
    configured: true,
    signedIn,
    needsSignInForConnect: !signedIn,
    google: {
      connected: googleConnected,
      email: googleEmail,
      available: isGoogleConnectConfigured(),
    },
    microsoft: {
      connected: microsoftConnected,
      email: microsoftEmail,
      available: isMicrosoftConnectConfigured(),
    },
    slack: {
      connected: slackConnected,
      team: slackTeam,
      available: isSlackConnectConfigured(),
    },
    ...(!signedIn
      ? {
          hint: "Sign in to connect Gmail, Calendar, Outlook, or Slack. Connections are private to your account.",
        }
      : {}),
  });
}
