import type { UserLocationHint } from "@/lib/client-location";
import { countryName, regionName } from "@/lib/geo-labels";
import { clientIp } from "@/lib/request-context";
import { reverseGeocodePlace } from "@/lib/reverse-geocode";

function header(request: Request, name: string): string | undefined {
  const v = request.headers.get(name)?.trim();
  return v && v.length > 0 ? v : undefined;
}

function parseFloatHeader(request: Request, name: string): number | undefined {
  const v = header(request, name);
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function humanizeLocation(loc: UserLocationHint): UserLocationHint {
  const countryCode = loc.countryCode || (loc.country && loc.country.length === 2 ? loc.country.toUpperCase() : undefined);
  const country = countryName(loc.country || countryCode) || loc.country;
  const region = regionName(loc.region, countryCode) || loc.region;
  return {
    ...loc,
    city: loc.city,
    region,
    country,
    countryCode,
  };
}

/** Vercel / CDN geo headers (production on fighur.ai). */
export function locationFromVercelHeaders(request: Request): UserLocationHint | null {
  const city = header(request, "x-vercel-ip-city");
  const region = header(request, "x-vercel-ip-country-region");
  const country = header(request, "x-vercel-ip-country");
  const lat = parseFloatHeader(request, "x-vercel-ip-latitude");
  const lon = parseFloatHeader(request, "x-vercel-ip-longitude");
  const timezone = header(request, "x-vercel-ip-timezone");

  if (!city && !region && !country && lat === undefined) return null;

  return humanizeLocation({
    city: city ? decodeURIComponent(city.replace(/\+/g, " ")) : undefined,
    region: region ? decodeURIComponent(region) : undefined,
    country: country ? decodeURIComponent(country) : undefined,
    countryCode: country && country.length === 2 ? country.toUpperCase() : undefined,
    latitude: lat,
    longitude: lon,
    timezone,
    source: "vercel",
  });
}

/** Free IP geolocation fallback (non-commercial fair use). */
async function locationFromIp(ip: string): Promise<UserLocationHint | null> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip === "::1") return null;
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,countryCode,lat,lon,timezone`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      city?: string;
      regionName?: string;
      country?: string;
      countryCode?: string;
      lat?: number;
      lon?: number;
      timezone?: string;
    };
    if (data.status !== "success") return null;
    return humanizeLocation({
      city: data.city,
      region: data.regionName,
      country: data.country,
      countryCode: data.countryCode,
      latitude: data.lat,
      longitude: data.lon,
      timezone: data.timezone,
      source: "ip",
    });
  } catch {
    return null;
  }
}

/** Fill city/region when the client only sent GPS coordinates. */
async function enrichWithReverseGeocode(loc: UserLocationHint): Promise<UserLocationHint> {
  if (loc.city) return loc;
  if (loc.latitude === undefined || loc.longitude === undefined) return loc;
  const place = await reverseGeocodePlace(loc.latitude, loc.longitude);
  if (!place) return loc;
  return {
    ...loc,
    city: place.city || loc.city,
    region: place.region || loc.region,
    country: place.country || loc.country,
    countryCode: place.countryCode || loc.countryCode,
  };
}

/** Fast path for People tracking — Vercel geo only, no extra lookups. */
export function resolveUserLocationFast(
  request: Request,
  clientHint: UserLocationHint | null,
): UserLocationHint | null {
  if (clientHint && (clientHint.city || clientHint.region || clientHint.country || clientHint.latitude !== undefined)) {
    return humanizeLocation(clientHint);
  }
  return locationFromVercelHeaders(request);
}

export async function resolveUserLocation(
  request: Request,
  clientHint: UserLocationHint | null,
): Promise<UserLocationHint | null> {
  if (
    clientHint &&
    (clientHint.city ||
      (clientHint.latitude !== undefined && clientHint.longitude !== undefined))
  ) {
    return enrichWithReverseGeocode(clientHint);
  }

  const vercel = locationFromVercelHeaders(request);
  if (vercel) return enrichWithReverseGeocode(vercel);

  const ip = clientIp(request);
  const fromIp = await locationFromIp(ip);
  return fromIp ? enrichWithReverseGeocode(fromIp) : null;
}

/** Same confident wording as the original location-aware weather release. */
export function userLocationSystemContext(loc: UserLocationHint | null): string {
  if (!loc) return "";
  const label = [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
  const coords =
    loc.latitude !== undefined && loc.longitude !== undefined
      ? ` (${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)})`
      : "";
  if (!label && !coords) return "";
  return `

## User location (detected)
The user is approximately in **${label || "their area"}**${coords}${loc.timezone ? ` · timezone ${loc.timezone}` : ""} (source: ${loc.source}).
- For "weather here" / "my weather" / "what's it like outside" — call **get_weather** with location **"${loc.city || label}"** (or use coordinates if the tool accepts them).
- Do not ask which city unless detection failed.`;
}
