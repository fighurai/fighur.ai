import type { UserLocationHint } from "@/lib/client-location";
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

/** Vercel / CDN geo headers (production on fighur.ai). */
function locationFromVercelHeaders(request: Request): UserLocationHint | null {
  const city = header(request, "x-vercel-ip-city");
  const region = header(request, "x-vercel-ip-country-region");
  const country = header(request, "x-vercel-ip-country");
  const lat = parseFloatHeader(request, "x-vercel-ip-latitude");
  const lon = parseFloatHeader(request, "x-vercel-ip-longitude");
  const timezone = header(request, "x-vercel-ip-timezone");

  if (!city && !country && lat === undefined) return null;

  return {
    city: city ? decodeURIComponent(city) : undefined,
    region: region ? decodeURIComponent(region) : undefined,
    country: country ? decodeURIComponent(country) : undefined,
    latitude: lat,
    longitude: lon,
    timezone,
    source: "vercel",
  };
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
    return {
      city: data.city,
      region: data.regionName,
      country: data.country,
      countryCode: data.countryCode,
      latitude: data.lat,
      longitude: data.lon,
      timezone: data.timezone,
      source: "ip",
    };
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

export async function resolveUserLocation(
  request: Request,
  clientHint: UserLocationHint | null,
): Promise<UserLocationHint | null> {
  // Browser GPS always wins over CDN/IP guesses (those are often a wrong metro).
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

export function userLocationSystemContext(loc: UserLocationHint | null): string {
  if (!loc) {
    return `

## User location
Precise location is **unknown** (browser GPS not granted yet, or unavailable).
- For "weather here" / "my weather" / local asks: **ask which city** (one short question). Do not invent a metro like Atlanta from guesswork.
- Do not claim the user is in a specific city.`;
  }

  const label = [loc.city, loc.region, loc.country].filter(Boolean).join(", ");
  const coords =
    loc.latitude !== undefined && loc.longitude !== undefined
      ? ` (${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)})`
      : "";
  if (!label && !coords) return "";

  const isPrecise = loc.source === "browser";
  const placeForTools =
    loc.city || label || `${loc.latitude?.toFixed(4)}, ${loc.longitude?.toFixed(4)}`;

  if (!isPrecise) {
    return `

## User location (LOW CONFIDENCE — IP/CDN guess only)
A rough network estimate says **${label || "unknown"}**${coords}${loc.timezone ? ` · timezone ${loc.timezone}` : ""} (source: ${loc.source}).
This is often wrong (VPN, ISP routing, edge POP). **Do not treat it as the user's real city.**
- For "weather here" / "my location": ask which city they mean (or tell them to Allow Location in the browser), then use that answer.
- Never confidently say they are in ${loc.city || "that metro"} unless they confirm.`;
  }

  return `

## User location (precise — browser GPS)
The user is approximately in **${label || "their area"}**${coords}${loc.timezone ? ` · timezone ${loc.timezone}` : ""} (source: browser).
- For "weather here" / "my weather" / "what's it like outside" — call **get_weather** with location **"${placeForTools}"** or use the coordinates above.
- Prefer coordinates over city name when both are available.
- Do not ask which city unless they say the place is wrong.`;
}
