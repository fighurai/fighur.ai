/** Expand Vercel ISO / region codes so People shows "South Carolina" and "Canada", not "SC" / "CA". */

const COUNTRIES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  DE: "Germany",
  FR: "France",
  MX: "Mexico",
  IN: "India",
  BR: "Brazil",
  JP: "Japan",
  KR: "South Korea",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  IE: "Ireland",
  NZ: "New Zealand",
  SG: "Singapore",
  AE: "United Arab Emirates",
  PH: "Philippines",
  NG: "Nigeria",
};

const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

function decodeMaybe(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).trim() || undefined;
  } catch {
    return raw.trim() || undefined;
  }
}

export function countryName(codeOrName: string | undefined): string | undefined {
  const raw = decodeMaybe(codeOrName);
  if (!raw) return undefined;
  if (raw.length === 2) return COUNTRIES[raw.toUpperCase()] || raw;
  return raw;
}

export function regionName(region: string | undefined, countryCode?: string): string | undefined {
  const raw = decodeMaybe(region);
  if (!raw) return undefined;
  const code = raw.toUpperCase();
  const cc = countryCode?.toUpperCase();
  if ((cc === "US" || !cc) && US_STATES[code]) return US_STATES[code];
  if ((cc === "CA" || !cc) && CA_PROVINCES[code]) return CA_PROVINCES[code];
  if (cc === "US" && raw.toLowerCase() === "sc") return "South Carolina";
  return raw;
}

export function prettyPlaceLabel(parts: {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}): string | undefined {
  const city = decodeMaybe(parts.city);
  const cc = (parts.countryCode || (parts.country?.length === 2 ? parts.country : undefined))?.toUpperCase();
  const region = regionName(parts.region, cc);
  const country = countryName(parts.country || cc);
  const label = [city, region, country].filter(Boolean).join(", ");
  return label || undefined;
}
