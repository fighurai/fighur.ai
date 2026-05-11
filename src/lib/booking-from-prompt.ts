import { parse } from "chrono-node";

/** Acuity dynamic links accept `datetime` in local offset form; see https://help.acuityscheduling.com/hc/en-us/articles/31919067234445-Parameters-for-dynamic-links */
function formatLocalDateTimeForAcuity(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const mon = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = pad(Math.floor(abs / 60));
  const offM = pad(abs % 60);
  return `${y}-${mon}-${day}T${h}:${min}:${sec}${sign}${offH}:${offM}`;
}

function appendDatetimeParam(baseUrl: string, datetime: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}datetime=${encodeURIComponent(datetime)}`;
}

export type BookingHrefResolution = {
  href: string;
  /** True when a time (hour or minute) was parsed and appended for Acuity */
  parsedTime: boolean;
};

/**
 * If `prompt` contains a natural-language date **and** time (e.g. "Tue 3pm", "April 20 at 14:30"),
 * returns the booking URL with Acuity's `datetime` query. Date-only phrases keep the base URL
 * so Acuity is not sent a misleading midnight slot.
 */
export function resolveBookingHref(
  baseUrl: string,
  prompt: string,
  now: Date = new Date(),
): BookingHrefResolution {
  const base = baseUrl.trim();
  const trimmed = prompt.trim();
  if (!trimmed) return { href: base, parsedTime: false };

  const results = parse(trimmed, now, { forwardDate: true });
  const first = results[0];
  if (!first?.start) return { href: base, parsedTime: false };

  const { start } = first;
  if (!start.isCertain("hour") && !start.isCertain("minute")) {
    return { href: base, parsedTime: false };
  }

  const d = first.date();
  if (Number.isNaN(d.getTime())) return { href: base, parsedTime: false };

  const datetime = formatLocalDateTimeForAcuity(d);
  return { href: appendDatetimeParam(base, datetime), parsedTime: true };
}
