import { NextResponse } from "next/server";

import {
  connectRedirectUris,
  isGoogleConnectConfigured,
  isMicrosoftConnectConfigured,
} from "@/lib/auth-providers";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret } from "@/lib/oauth-crypto";

export async function GET() {
  const origin = getOAuthBaseUrl();
  return NextResponse.json({
    configured: Boolean(getAppSealingSecret()),
    oauthBaseUrl: origin,
    redirectUris: connectRedirectUris(origin),
    google: { connect: isGoogleConnectConfigured() },
    microsoft: { connect: isMicrosoftConnectConfigured() },
  });
}
