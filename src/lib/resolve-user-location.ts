import type { UserLocationHint } from "@/lib/client-location";
import { clientIp } from "@/lib/request-context";

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

export async function resolveUserLocation(
  request: Request,
  clientHint: UserLocationHint | null,
): Promise<UserLocationHint | null> {
  if (clientHint?.city || (clientHint?.latitude !== undefined && clientHint?.longitude !== undefined)) {
    return clientHint;
  }

  const vercel = locationFromVercelHeaders(request);
  if (vercel) return vercel;

  const ip = clientIp(request);
  return locationFromIp(ip);
}

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
