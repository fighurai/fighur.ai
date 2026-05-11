/**
 * Origin used for OAuth redirect_uri (must match Google Cloud / Azure app registration).
 * Prefer SMILE_OAUTH_BASE_URL (e.g. http://localhost:3099) then NEXT_PUBLIC_SITE_URL.
 */
export function getOAuthBaseUrl(): string {
  const explicit = process.env.SMILE_OAUTH_BASE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* fall through */
    }
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      try {
        return new URL(`https://${site}`).origin;
      } catch {
        /* fall through */
      }
    }
  }
  return "http://localhost:3099";
}
