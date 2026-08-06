import { createPrivateKey, createSign, randomBytes } from "crypto";

import { createRemoteJWKSet, jwtVerify } from "jose";

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
export function createAppleClientSecret(clientId: string): string {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  if (!teamId || !keyId) throw new Error("APPLE_TEAM_ID / APPLE_KEY_ID missing.");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 60 * 60 * 24 * 25,
      aud: "https://appleid.apple.com",
      sub: clientId,
    }),
  ).toString("base64url");

  const data = `${header}.${payload}`;
  const key = createPrivateKey(applePrivateKeyPem());
  const sign = createSign("SHA256");
  sign.update(data);
  sign.end();
  // Apple expects IEEE-P1363 (r||s) signature, not DER — convert DER → raw
  const der = sign.sign(key);
  const rawSig = derToJose(der);
  return `${data}.${rawSig.toString("base64url")}`;
}

/** Convert ECDSA DER signature to JOSE raw r||s (32+32 for P-256). */
function derToJose(der: Buffer): Buffer {
  // SEQUENCE { INTEGER r, INTEGER s }
  let offset = 2;
  if (der[0] !== 0x30) throw new Error("Invalid ECDSA DER");
  if (der[1] & 0x80) offset += der[1] & 0x7f;

  const readInt = (): Buffer => {
    if (der[offset] !== 0x02) throw new Error("Invalid ECDSA DER int");
    const len = der[offset + 1]!;
    offset += 2;
    let bytes = der.subarray(offset, offset + len);
    offset += len;
    // strip leading zero padding
    while (bytes.length > 32 && bytes[0] === 0) bytes = bytes.subarray(1);
    if (bytes.length > 32) throw new Error("ECDSA int too large");
    if (bytes.length < 32) {
      const padded = Buffer.alloc(32);
      bytes.copy(padded, 32 - bytes.length);
      return padded;
    }
    return Buffer.from(bytes);
  };

  const r = readInt();
  const s = readInt();
  return Buffer.concat([r, s]);
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
