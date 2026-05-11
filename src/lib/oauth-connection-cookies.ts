import type { ChatIntegrationFlags } from "@/lib/smile-system-prompt";
import type { GoogleCookiePayload, MicrosoftCookiePayload, SlackCookiePayload } from "@/lib/oauth-payload-types";
import { getAppSealingSecret, unsealJson } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";
import { loadIntegrationFlagsFromUserStore } from "@/lib/user-oauth-store";

export const COOKIE_GOOGLE = "smile_oauth_google";
export const COOKIE_MICROSOFT = "smile_oauth_microsoft";
export const COOKIE_SLACK = "smile_oauth_slack";

export type { GoogleCookiePayload, MicrosoftCookiePayload, SlackCookiePayload } from "@/lib/oauth-payload-types";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(`${name}=`)) {
      return decodeURIComponent(p.slice(name.length + 1));
    }
  }
  return null;
}

/** Legacy: OAuth payloads in httpOnly cookies (before per-user disk storage). */
export function getCookieOAuthIntegrationFlags(
  request: Request,
  secret: string,
): Partial<ChatIntegrationFlags> {
  const out: Partial<ChatIntegrationFlags> = {};

  const g = readCookie(request, COOKIE_GOOGLE);
  if (g) {
    const p = unsealJson<GoogleCookiePayload>(g, secret);
    if (p?.v === 1 && typeof p.refresh_token === "string" && p.refresh_token.length > 0) {
      out.gmail = true;
      out.googleCalendar = true;
    }
  }

  const m = readCookie(request, COOKIE_MICROSOFT);
  if (m) {
    const p = unsealJson<MicrosoftCookiePayload>(m, secret);
    if (p?.v === 1 && typeof p.refresh_token === "string" && p.refresh_token.length > 0) {
      out.outlook = true;
      out.microsoft365 = true;
    }
  }

  const s = readCookie(request, COOKIE_SLACK);
  if (s) {
    const p = unsealJson<SlackCookiePayload>(s, secret);
    if (p?.v === 1 && typeof p.access_token === "string" && p.access_token.length > 0) {
      out.slack = true;
    }
  }

  return out;
}

/**
 * Signed-in users: flags from encrypted files under their user directory.
 * Anonymous: legacy cookie-based tokens only.
 */
export async function getLiveOAuthIntegrationFlags(
  request: Request,
): Promise<Partial<ChatIntegrationFlags>> {
  const secret = getAppSealingSecret();
  if (!secret) return {};

  const session = await readVerifiedSession(request);
  if (session) {
    return loadIntegrationFlagsFromUserStore(session.userId, secret);
  }

  return getCookieOAuthIntegrationFlags(request, secret);
}

export function mergeIntegrationFlags(
  fromBody: Partial<ChatIntegrationFlags> | null,
  fromCookies: Partial<ChatIntegrationFlags>,
): Partial<ChatIntegrationFlags> | null {
  const merged: Partial<ChatIntegrationFlags> = { ...(fromBody ?? {}) };
  for (const k of Object.keys(fromCookies) as (keyof ChatIntegrationFlags)[]) {
    if (fromCookies[k] === true) merged[k] = true;
  }
  return Object.keys(merged).length ? merged : null;
}
