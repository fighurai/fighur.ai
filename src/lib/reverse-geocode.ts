/**
 * Reverse-geocode lat/lon → place label.
 * Open-Meteo has no reverse endpoint; use BigDataCloud (CORS-friendly) then Nominatim.
 */

export type ReverseGeocodePlace = {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
};

async function fromBigDataCloud(lat: number, lon: number): Promise<ReverseGeocodePlace | null> {
  try {
    const url = new URL("https://api-bdc.io/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("localityLanguage", "en");
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
      countryCode?: string;
    };
    const city = (data.city || data.locality || "").trim() || undefined;
    const region = data.principalSubdivision?.trim() || undefined;
    const country = data.countryName?.trim() || undefined;
    const countryCode = data.countryCode?.trim() || undefined;
    if (!city && !region && !country) return null;
    return { city, region, country, countryCode };
  } catch {
    return null;
  }
}

async function fromNominatim(lat: number, lon: number): Promise<ReverseGeocodePlace | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en");
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: {
        Accept: "application/json",
        // Nominatim requires an identifying UA for non-browser clients.
        "User-Agent": "FighurAI/1.0 (https://fighur.ai; location)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        county?: string;
        state?: string;
        region?: string;
        country?: string;
        country_code?: string;
      };
    };
    const a = data.address;
    if (!a) return null;
    const city =
      a.city || a.town || a.village || a.municipality || a.county || undefined;
    const region = a.state || a.region || undefined;
    const country = a.country || undefined;
    const countryCode = a.country_code?.toUpperCase() || undefined;
    if (!city && !region && !country) return null;
    return { city, region, country, countryCode };
  } catch {
    return null;
  }
}

/** Resolve city/region/country for GPS coordinates. */
export async function reverseGeocodePlace(
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodePlace | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const primary = await fromBigDataCloud(latitude, longitude);
  if (primary?.city) return primary;
  const fallback = await fromNominatim(latitude, longitude);
  if (fallback) {
    return {
      city: fallback.city || primary?.city,
      region: fallback.region || primary?.region,
      country: fallback.country || primary?.country,
      countryCode: fallback.countryCode || primary?.countryCode,
    };
  }
  return primary;
}
