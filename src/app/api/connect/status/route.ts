import { NextResponse } from "next/server";

import { isGoogleConnectConfigured, isMicrosoftConnectConfigured } from "@/lib/auth-providers";
import { getAppSealingSecret, unsealJson } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";
import { readGoogleFromStore, readMicrosoftFromStore } from "@/lib/user-oauth-store";

export async function GET(request: Request) {
  const secret = getAppSealingSecret();
  if (!secret) {
    return NextResponse.json({
      configured: false,
      signedIn: false,
      google: { connected: false },
      microsoft: { connected: false },
      hint: "Set SMILE_APP_SECRET or SMILE_OAUTH_COOKIE_SECRET (16+ chars) and provider client IDs to enable OAuth.",
    });
  }

  const session = await readVerifiedSession(request);
  const signedIn = Boolean(session);

  let googleEmail: string | undefined;
  let googleConnected = false;
  let microsoftEmail: string | undefined;
  let microsoftConnected = false;

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
    ...(!signedIn
      ? { hint: "Sign in to connect Gmail, Calendar, or Outlook. Connections are private to your account." }
      : {}),
  });
}
