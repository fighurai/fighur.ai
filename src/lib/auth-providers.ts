/** Server-side checks for which SSO providers are configured (no secrets exposed). */

export function isGoogleSsoConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function isMicrosoftSsoConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID?.trim() && process.env.MICROSOFT_CLIENT_SECRET?.trim(),
  );
}

export function googleSsoRedirectUri(origin: string): string {
  return `${origin}/api/auth/sso/google/callback`;
}

export function googleConnectRedirectUri(origin: string): string {
  return `${origin}/api/connect/google/callback`;
}
