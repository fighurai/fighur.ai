import { readGoogleConnectionCookie, readMicrosoftConnectionCookie } from "@/lib/connection-cookies";
import { readGoogleFromStore, readMicrosoftFromStore } from "@/lib/user-oauth-store";
import { getAppSealingSecret } from "@/lib/oauth-crypto";
import { readVerifiedSession } from "@/lib/session-cookie";

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

async function googleRefreshForUser(
  request: Request,
  userId: string,
): Promise<string | null> {
  const secret = getAppSealingSecret();
  if (!secret) return null;

  const stored = await readGoogleFromStore(userId, secret, request);
  if (stored?.refresh_token) return googleRefreshToken(stored.refresh_token);

  const cookie = readGoogleConnectionCookie(request, userId);
  if (cookie?.refresh_token) return googleRefreshToken(cookie.refresh_token);

  return null;
}

async function microsoftRefreshForUser(
  request: Request,
  userId: string,
): Promise<string | null> {
  const secret = getAppSealingSecret();
  if (!secret) return null;

  const stored = await readMicrosoftFromStore(userId, secret, request);
  if (stored?.refresh_token) return microsoftRefreshToken(stored.refresh_token);

  const cookie = readMicrosoftConnectionCookie(request, userId);
  if (cookie?.refresh_token) return microsoftRefreshToken(cookie.refresh_token);

  return null;
}

/** Google access token — signed-in user only; never uses another account's cookies. */
export async function getGoogleAccessToken(request: Request): Promise<string | null> {
  const session = await readVerifiedSession(request);
  if (!session) return null;
  return googleRefreshForUser(request, session.userId);
}

/** Microsoft access token — signed-in user only. */
export async function getMicrosoftAccessToken(request: Request): Promise<string | null> {
  const session = await readVerifiedSession(request);
  if (!session) return null;
  return microsoftRefreshForUser(request, session.userId);
}
