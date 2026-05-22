import { NextResponse } from "next/server";

import { isGoogleConnectConfigured, isMicrosoftConnectConfigured } from "@/lib/auth-providers";
import { getAppSealingSecret, unsealJson } from "@/lib/oauth-crypto";
import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";
import {
  COOKIE_GOOGLE,
  COOKIE_MICROSOFT,
  getCookieOAuthIntegrationFlags,
} from "@/lib/oauth-connection-cookies";
import type { GoogleCookiePayload, MicrosoftCookiePayload } from "@/lib/oauth-payload-types";
import { readVerifiedSession } from "@/lib/session-cookie";
import { readGoogleFromStore, readMicrosoftFromStore } from "@/lib/user-oauth-store";

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
  }

  const cookieLegacy: Partial<ChatIntegrationFlags> = signedIn
    ? {}
    : getCookieOAuthIntegrationFlags(request, secret);
  const hasLegacy = Boolean(cookieLegacy.gmail || cookieLegacy.outlook || cookieLegacy.microsoft365);

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
    ...(hasLegacy && !signedIn
      ? {
          hint: "Sign in to link integrations to your account. Legacy browser-only tokens are in use until you reconnect.",
        }
      : !signedIn
        ? { hint: "Sign in so connections are stored in your private server folder." }
        : {}),
  });
}
