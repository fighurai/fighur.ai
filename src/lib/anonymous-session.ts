import { randomBytes } from "crypto";

import { getAppSealingSecret, sealJson, unsealJson } from "@/lib/oauth-crypto";

export const COOKIE_ANON = "smile_anon";

type AnonPayload = { v: 1; id: string; iat: number };

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const p = part.trim();
    if (p.startsWith(`${name}=`)) return decodeURIComponent(p.slice(name.length + 1));
  }
  return null;
}

export function readAnonymousId(request: Request): string | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const raw = readCookie(request, COOKIE_ANON);
  if (!raw) return null;
  const p = unsealJson<AnonPayload>(raw, secret);
  if (!p || p.v !== 1 || typeof p.id !== "string") return null;
  if (!/^[a-zA-Z0-9_-]{16,64}$/.test(p.id)) return null;
  return p.id;
}

export function sealAnonymousId(id: string): string | null {
  const secret = getAppSealingSecret();
  if (!secret) return null;
  const payload: AnonPayload = { v: 1, id, iat: Date.now() };
  return sealJson(payload, secret);
}

export function createAnonymousId(): string {
  return randomBytes(24).toString("base64url");
}

export function anonymousCookieOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
