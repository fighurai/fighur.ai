export type WeatherResult =
  | {
      ok: true;
      location: string;
      latitude: number;
      longitude: number;
      timezone: string;
      current: {
        time: string;
        temperatureF: number;
        temperatureC: number;
        apparentTemperatureF: number;
        humidityPercent: number;
        windMph: number;
        weatherCode: number;
        description: string;
        isDay: boolean;
      };
      forecast: Array<{
        date: string;
        highF: number;
        lowF: number;
        description: string;
      }>;
    }
  | { ok: false; error: string };

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
};

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

function describe(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? `Weather code ${code}`;
}

async function geocode(query: string): Promise<
  | { name: string; lat: number; lon: number; timezone: string }
  | { error: string }
> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query.trim());
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { error: `Geocoding failed (${res.status})` };
  const data = (await res.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number; timezone?: string; admin1?: string; country?: string }>;
  };
  const hit = data.results?.[0];
  if (!hit) return { error: `Could not find location: ${query}` };
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return {
    name: label,
    lat: hit.latitude,
    lon: hit.longitude,
    timezone: hit.timezone ?? "auto",
  };
}

async function reverseGeocode(lat: number, lon: number): Promise<
  | { name: string; lat: number; lon: number; timezone: string }
  | { error: string }
> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { error: `Reverse geocoding failed (${res.status})` };
  const data = (await res.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number; timezone?: string; admin1?: string; country?: string }>;
  };
  const hit = data.results?.[0];
  if (!hit) return { error: "Could not resolve coordinates to a place name." };
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return {
    name: label,
    lat: hit.latitude,
    lon: hit.longitude,
    timezone: hit.timezone ?? "auto",
  };
}

async function forecastForGeo(geo: { name: string; lat: number; lon: number; timezone: string }): Promise<WeatherResult> {

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(geo.lat));
  url.searchParams.set("longitude", String(geo.lon));
  url.searchParams.set("timezone", geo.timezone);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
  );
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "mph");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { ok: false, error: `Weather API failed (${res.status})` };

  const data = (await res.json()) as {
    timezone?: string;
    current?: {
      time?: string;
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      weather_code?: number;
      is_day?: number;
    };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };

  const cur = data.current;
  if (!cur || cur.temperature_2m === undefined) {
    return { ok: false, error: "No current weather data for this location." };
  }

  const code = cur.weather_code ?? 0;
  const tempC = cur.temperature_2m;
  const daily = data.daily;
  const forecast =
    daily?.time?.slice(0, 5).map((date, i) => ({
      date,
      highF: cToF(daily.temperature_2m_max?.[i] ?? tempC),
      lowF: cToF(daily.temperature_2m_min?.[i] ?? tempC),
      description: describe(daily.weather_code?.[i] ?? code),
    })) ?? [];

  return {
    ok: true,
    location: geo.name,
    latitude: geo.lat,
    longitude: geo.lon,
    timezone: data.timezone ?? geo.timezone,
    current: {
      time: cur.time ?? new Date().toISOString(),
      temperatureC: Math.round(tempC * 10) / 10,
      temperatureF: cToF(tempC),
      apparentTemperatureF: cToF(cur.apparent_temperature ?? tempC),
      humidityPercent: Math.round(cur.relative_humidity_2m ?? 0),
      windMph: Math.round((cur.wind_speed_10m ?? 0) * 10) / 10,
      weatherCode: code,
      description: describe(code),
      isDay: cur.is_day === 1,
    },
    forecast,
  };
}

/** Weather at coordinates (browser / IP geo). */
export async function fetchWeatherAtCoordinates(
  latitude: number,
  longitude: number,
): Promise<WeatherResult> {
  const geo = await reverseGeocode(latitude, longitude);
  if ("error" in geo) {
    return forecastForGeo({
      name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
      lat: latitude,
      lon: longitude,
      timezone: "auto",
    });
  }
  return forecastForGeo(geo);
}

/** Current weather + 5-day daily forecast via Open-Meteo (no API key). */
export async function fetchWeather(locationQuery: string): Promise<WeatherResult> {
  const q = locationQuery.trim();
  if (!q) return { ok: false, error: "location is required (city name or place)" };

  const geo = await geocode(q);
  if ("error" in geo) return { ok: false, error: geo.error };

  return forecastForGeo(geo);
}
