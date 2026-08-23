export type TrafficSource = {
  label: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

function hostOf(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function firstParam(search: string | undefined, names: string[]): string | undefined {
  if (!search) return undefined;
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const name of names) {
    const v = q.get(name)?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Instagram, TikTok, ads, and other inbound links — not just in-app signed-in users. */
export function parseTrafficSource(input: {
  referrer?: string | null;
  search?: string | null;
}): TrafficSource {
  const referrer = input.referrer?.trim() || undefined;
  const search = input.search?.trim() || undefined;
  const utmSource = firstParam(search, ["utm_source"])?.toLowerCase();
  const utmMedium = firstParam(search, ["utm_medium"])?.toLowerCase();
  const utmCampaign = firstParam(search, ["utm_campaign"]);
  const host = hostOf(referrer);
  const igClick =
    Boolean(firstParam(search, ["igshid", "igsh", "ig_rid"])) ||
    utmSource === "instagram" ||
    utmSource === "ig" ||
    host.includes("instagram.com");

  let label = "Direct / unknown";
  if (igClick) label = "Instagram";
  else if (utmSource === "tiktok" || host.includes("tiktok.com")) label = "TikTok";
  else if (utmSource === "twitter" || utmSource === "x" || host === "t.co" || host.includes("twitter.com") || host === "x.com") {
    label = "X / Twitter";
  } else if (utmSource === "facebook" || utmSource === "fb" || host.includes("facebook.com") || host.includes("fb.com") || host.includes("l.facebook.com")) {
    label = "Facebook";
  } else if (utmSource === "threads" || host.includes("threads.net")) label = "Threads";
  else if (utmSource === "linkedin" || host.includes("linkedin.com")) label = "LinkedIn";
  else if (utmSource === "youtube" || host.includes("youtube.com") || host.includes("youtu.be")) label = "YouTube";
  else if (utmSource === "google" || host.includes("google.")) label = "Google";
  else if (utmSource === "bing" || host.includes("bing.com")) label = "Bing";
  else if (utmSource) label = utmSource;
  else if (host.includes("fighur.ai") || host.includes("fighurai.com")) label = "Internal link";
  else if (host) label = host;

  return {
    label,
    referrer: referrer ? referrer.slice(0, 300) : undefined,
    utmSource,
    utmMedium,
    utmCampaign: utmCampaign?.slice(0, 80),
  };
}

export function parseTrafficSourceFromUnknown(raw: unknown): TrafficSource | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return parseTrafficSource({
    referrer: typeof o.referrer === "string" ? o.referrer : undefined,
    search: typeof o.search === "string" ? o.search : undefined,
  });
}
