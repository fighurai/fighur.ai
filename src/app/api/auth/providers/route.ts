import { NextResponse } from "next/server";

import {
  googleConnectRedirectUri,
  googleSsoRedirectUri,
  isGoogleSsoConfigured,
  isMicrosoftSsoConfigured,
} from "@/lib/auth-providers";
import { getOAuthBaseUrl } from "@/lib/oauth-base-url";
import { getAppSealingSecret } from "@/lib/oauth-crypto";

export async function GET() {
  const origin = getOAuthBaseUrl();
  const sessionSecret = Boolean(getAppSealingSecret());

  return NextResponse.json({
    sessionSecret,
    oauthBaseUrl: origin,
    google: {
      sso: isGoogleSsoConfigured(),
      redirectUri: googleSsoRedirectUri(origin),
      connectRedirectUri: googleConnectRedirectUri(origin),
    },
    microsoft: { sso: isMicrosoftSsoConfigured() },
  });
}
