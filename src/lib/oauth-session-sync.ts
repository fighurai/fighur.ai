import type { NextResponse } from "next/server";

import {
  attachGoogleConnectionCookie,
  attachMicrosoftConnectionCookie,
} from "@/lib/connection-cookies";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { readGoogleFromStore, readMicrosoftFromStore } from "@/lib/user-oauth-store";

/** Re-attach httpOnly OAuth cookies from the signed-in user's server store (after login). */
export async function attachOAuthCookiesFromUserStore(
  res: NextResponse,
  userId: string,
): Promise<void> {
  const secret = getAppSealingSecret();
  if (!secret) return;

  const google = await readGoogleFromStore(userId, secret);
  if (google?.refresh_token) {
    attachGoogleConnectionCookie(res, userId, google);
  }

  const microsoft = await readMicrosoftFromStore(userId, secret);
  if (microsoft?.refresh_token) {
    attachMicrosoftConnectionCookie(res, userId, microsoft);
  }
}
