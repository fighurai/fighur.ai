/** Location sent from browser geolocation or inferred on the server. */
export type UserLocationHint = {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  source: "browser" | "vercel" | "ip" | "client_label";
};

export function formatUserLocationLabel(loc: UserLocationHint): string | null {
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (loc.latitude !== undefined && loc.longitude !== undefined) {
    return `${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)}`;
  }
  return null;
}

export function parseClientLocationPayload(raw: unknown): UserLocationHint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const city = typeof o.city === "string" ? o.city.trim() : undefined;
  const region = typeof o.region === "string" ? o.region.trim() : undefined;
  const country = typeof o.country === "string" ? o.country.trim() : undefined;
  const lat = typeof o.latitude === "number" ? o.latitude : undefined;
  const lon = typeof o.longitude === "number" ? o.longitude : undefined;
  if (!city && !country && lat === undefined) return null;
  return {
    city,
    region,
    country,
    countryCode: typeof o.countryCode === "string" ? o.countryCode : undefined,
    latitude: lat,
    longitude: lon,
    timezone: typeof o.timezone === "string" ? o.timezone : undefined,
    source: "browser",
  };
}
