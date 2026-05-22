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

export function isGoogleConnectConfigured(): boolean {
  return isGoogleSsoConfigured();
}

export function isMicrosoftConnectConfigured(): boolean {
  return isMicrosoftSsoConfigured();
}

export function isSlackConnectConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim());
}

export function connectRedirectUris(origin: string) {
  return {
    google: googleConnectRedirectUri(origin),
    microsoft: `${origin}/api/connect/microsoft/callback`,
    slack: `${origin}/api/connect/slack/callback`,
  };
}
