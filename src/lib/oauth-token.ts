import { COOKIE_GOOGLE, COOKIE_MICROSOFT } from "@/lib/oauth-connection-cookies";
import { readGoogleConnectionCookie, readMicrosoftConnectionCookie } from "@/lib/connection-cookies";
import { readGoogleFromStore, readMicrosoftFromStore } from "@/lib/user-oauth-store";
import { getAppSealingSecret, unsealJson } from "@/lib/oauth-crypto";
import type { GoogleCookiePayload, MicrosoftCookiePayload } from "@/lib/oauth-payload-types";
import { readVerifiedSession } from "@/lib/session-cookie";

function readCookieRaw(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const p = part.trim();
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

function legacyGooglePayload(
  request: Request,
  userId: string | undefined,
): GoogleCookiePayload | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const raw = readCookieRaw(request, COOKIE_GOOGLE);
  if (!raw) return null;
  const p = unsealJson<GoogleCookiePayload & { userId?: string }>(raw, secret);
  if (p?.v !== 1 || typeof p.refresh_token !== "string" || !p.refresh_token) return null;
  if (p.userId && userId && p.userId !== userId) return null;
  return { v: 1, refresh_token: p.refresh_token, email: p.email };
}

async function googleRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

async function microsoftRefreshToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/** Resolve Google access token for signed-in user or legacy cookie. */
export async function getGoogleAccessToken(request: Request): Promise<string | null> {
  const secret = getAppSealingSecret();
  if (!secret) return null;

  const session = await readVerifiedSession(request);
  if (session) {
    const stored = await readGoogleFromStore(session.userId, secret, request);
    if (stored?.refresh_token) return googleRefreshToken(stored.refresh_token);
  }

  if (session?.userId) {
    const cookie = readGoogleConnectionCookie(request, session.userId);
    if (cookie?.refresh_token) return googleRefreshToken(cookie.refresh_token);
  }

  const legacy = legacyGooglePayload(request, session?.userId);
  if (legacy?.refresh_token) return googleRefreshToken(legacy.refresh_token);

  return null;
}

/** Resolve Microsoft access token for signed-in user or legacy cookie. */
export async function getMicrosoftAccessToken(request: Request): Promise<string | null> {
  const secret = getAppSealingSecret();
  if (!secret) return null;

  const session = await readVerifiedSession(request);
  if (session) {
    const stored = await readMicrosoftFromStore(session.userId, secret, request);
    if (stored?.refresh_token) return microsoftRefreshToken(stored.refresh_token);
  }

  if (session?.userId) {
    const cookie = readMicrosoftConnectionCookie(request, session.userId);
    if (cookie?.refresh_token) return microsoftRefreshToken(cookie.refresh_token);
  }

  const raw = readCookieRaw(request, COOKIE_MICROSOFT);
  if (raw && secret) {
    const p = unsealJson<MicrosoftCookiePayload & { userId?: string }>(raw, secret);
    if (
      p?.v === 1 &&
      typeof p.refresh_token === "string" &&
      p.refresh_token &&
      (!p.userId || !session?.userId || p.userId === session.userId)
    ) {
      return microsoftRefreshToken(p.refresh_token);
    }
  }

  return null;
}
