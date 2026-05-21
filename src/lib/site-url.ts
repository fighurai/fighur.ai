/**
 * Canonical public site URL (production: https://fighur.ai).
 * Set NEXT_PUBLIC_SITE_URL in Vercel if the apex differs (e.g. preview deploys).
 * Invalid values are ignored so `new URL(getSiteUrl())` in layout metadata never throws.
 */
const DEFAULT_SITE = "https://fighur.ai";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE;
  try {
    return new URL(raw).origin;
  } catch {
    try {
      return new URL(`http://${raw}`).origin;
    } catch {
      return DEFAULT_SITE;
    }
  }
}
