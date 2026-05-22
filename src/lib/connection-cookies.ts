import type { NextResponse } from "next/server";

import {
  COOKIE_GOOGLE,
  COOKIE_MICROSOFT,
  COOKIE_SLACK,
} from "@/lib/oauth-connection-cookies";
import { getAppSealingSecret, sealJson, unsealJson } from "@/lib/oauth-crypto";
import type {
  GoogleCookiePayload,
  MicrosoftCookiePayload,
  SlackCookiePayload,
} from "@/lib/oauth-payload-types";

type WithUserId<T> = T & { userId: string };

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function cookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: COOKIE_MAX_AGE };
}

function readCookieHeader(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const p = part.trim();
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export function attachGoogleConnectionCookie(
  res: NextResponse,
  userId: string,
  payload: GoogleCookiePayload,
): void {
  const secret = getAppSealingSecret();
  if (!secret) return;
  const sealed = sealJson({ ...payload, userId } satisfies WithUserId<GoogleCookiePayload>, secret);
  res.cookies.set(COOKIE_GOOGLE, sealed, cookieOptions());
}

export function attachMicrosoftConnectionCookie(
  res: NextResponse,
  userId: string,
  payload: MicrosoftCookiePayload,
): void {
  const secret = getAppSealingSecret();
  if (!secret) return;
  const sealed = sealJson({ ...payload, userId } satisfies WithUserId<MicrosoftCookiePayload>, secret);
  res.cookies.set(COOKIE_MICROSOFT, sealed, cookieOptions());
}

export function attachSlackConnectionCookie(
  res: NextResponse,
  userId: string,
  payload: SlackCookiePayload,
): void {
  const secret = getAppSealingSecret();
  if (!secret) return;
  const sealed = sealJson({ ...payload, userId } satisfies WithUserId<SlackCookiePayload>, secret);
  res.cookies.set(COOKIE_SLACK, sealed, cookieOptions());
}

export function readGoogleConnectionCookie(
  request: Request,
  userId: string,
): GoogleCookiePayload | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const raw = readCookieHeader(request, COOKIE_GOOGLE);
  if (!raw) return null;
  const p = unsealJson<WithUserId<GoogleCookiePayload>>(raw, secret);
  if (p?.v !== 1 || p.userId !== userId || typeof p.refresh_token !== "string" || !p.refresh_token) {
    return null;
  }
  return { v: 1, refresh_token: p.refresh_token, email: p.email };
}

export function readMicrosoftConnectionCookie(
  request: Request,
  userId: string,
): MicrosoftCookiePayload | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const raw = readCookieHeader(request, COOKIE_MICROSOFT);
  if (!raw) return null;
  const p = unsealJson<WithUserId<MicrosoftCookiePayload>>(raw, secret);
  if (p?.v !== 1 || p.userId !== userId || typeof p.refresh_token !== "string" || !p.refresh_token) {
    return null;
  }
  return { v: 1, refresh_token: p.refresh_token, email: p.email };
}

export function readSlackConnectionCookie(
  request: Request,
  userId: string,
): SlackCookiePayload | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const raw = readCookieHeader(request, COOKIE_SLACK);
  if (!raw) return null;
  const p = unsealJson<WithUserId<SlackCookiePayload>>(raw, secret);
  if (p?.v !== 1 || p.userId !== userId || typeof p.access_token !== "string" || !p.access_token) {
    return null;
  }
  return { v: 1, access_token: p.access_token, email: p.email, team_name: p.team_name };
}
