import { randomBytes } from "crypto";

import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";

/** Services ID (web) or Bundle ID (native) client id is configured. */
export function isAppleSsoConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID?.trim() &&
      process.env.APPLE_KEY_ID?.trim() &&
      process.env.APPLE_PRIVATE_KEY?.trim() &&
      (process.env.APPLE_SERVICES_ID?.trim() || process.env.APPLE_BUNDLE_ID?.trim()),
  );
}

export function appleServicesId(): string | null {
  return process.env.APPLE_SERVICES_ID?.trim() || null;
}

export function appleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || "ai.fighur.app";
}

export function appleSsoRedirectUri(origin: string): string {
  return `${origin}/api/auth/sso/apple/callback`;
}

function applePrivateKeyPem(): string {
  const raw = process.env.APPLE_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("APPLE_PRIVATE_KEY is not configured.");
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/** Apple client_secret JWT (valid up to 6 months; we use ~25 days). */
export async function createAppleClientSecret(clientId: string): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  if (!teamId || !keyId) throw new Error("APPLE_TEAM_ID / APPLE_KEY_ID missing.");

  const key = await importPKCS8(applePrivateKeyPem(), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 25)
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);
}

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type AppleIdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
  aud: string | string[];
};

export async function verifyAppleIdToken(
  idToken: string,
  audience: string | string[],
): Promise<AppleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience,
  });
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("Apple ID token missing sub.");
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    email_verified: payload.email_verified as boolean | string | undefined,
    is_private_email: payload.is_private_email as boolean | string | undefined,
    aud: payload.aud as string | string[],
  };
}

export function appleAuthAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code id_token");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("nonce", opts.nonce);
  return url.toString();
}

export function randomNonce(): string {
  return randomBytes(16).toString("hex");
}
