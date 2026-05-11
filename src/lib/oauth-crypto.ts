import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SALT = "smile-ai-oauth-v1";

function keyFromSecret(secret: string): Buffer {
  return scryptSync(secret, SALT, 32);
}

export function getOAuthCookieSecret(): string | null {
  const s = process.env.SMILE_OAUTH_COOKIE_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/** Prefer SMILE_APP_SECRET so sessions and user data can work without OAuth env. */
export function getAppSealingSecret(): string | null {
  const app = process.env.SMILE_APP_SECRET?.trim();
  if (app && app.length >= 16) return app;
  return getOAuthCookieSecret();
}

/** AES-256-GCM seal → base64url */
export function sealJson(payload: unknown, secret: string): string {
  const key = keyFromSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function unsealJson<T>(sealed: string, secret: string): T | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const key = keyFromSecret(secret);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
