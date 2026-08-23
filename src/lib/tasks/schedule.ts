export type TaskSchedulePreset = "hourly" | "daily" | "weekly";

export const TASK_SCHEDULE_PRESETS: TaskSchedulePreset[] = ["hourly", "daily", "weekly"];

export const DEFAULT_TASK_TIME_ZONE = "America/New_York";
export const DEFAULT_DAILY_HOUR = 8;
export const DEFAULT_DAILY_MINUTE = 0;

export type TaskScheduleOptions = {
  timeZone?: string;
  /** Local hour in `timeZone` (0–23). Used for daily / weekly. */
  hour?: number;
  /** Local minute in `timeZone` (0–59). */
  minute?: number;
};

export function isTaskSchedulePreset(v: unknown): v is TaskSchedulePreset {
  return v === "hourly" || v === "daily" || v === "weekly";
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTaskTimeZone(tz?: string | null): string {
  if (tz && isValidTimeZone(tz)) return tz;
  return DEFAULT_TASK_TIME_ZONE;
}

export function clampHour(hour: unknown, fallback = DEFAULT_DAILY_HOUR): number {
  const n = typeof hour === "number" ? hour : Number(hour);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < 0 || i > 23) return fallback;
  return i;
}

export function clampMinute(minute: unknown, fallback = DEFAULT_DAILY_MINUTE): number {
  const n = typeof minute === "number" ? minute : Number(minute);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < 0 || i > 59) return fallback;
  return i;
}

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

export function partsInTimeZone(date: Date, timeZone: string): ZoneParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday ?? "",
  };
}

/** Convert a civil wall-clock time in `timeZone` to a UTC Date. */
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const shown = partsInTimeZone(new Date(utc), timeZone);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = desiredAsUtc - shownAsUtc;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc);
}

export function formatClock12(hour24: number, minute = 0): string {
  const h = ((hour24 + 11) % 12) + 1;
  const ap = hour24 < 12 ? "AM" : "PM";
  return `${h}:${String(minute).padStart(2, "0")} ${ap}`;
}

export function formatNowInTimeZone(date: Date, timeZone: string): {
  isoDate: string;
  longLabel: string;
  monthDayYear: string;
} {
  const zone = resolveTaskTimeZone(timeZone);
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const longFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const mdY = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return {
    isoDate: dateFmt.format(date),
    longLabel: `${longFmt.format(date)} (${zone})`,
    monthDayYear: mdY.format(date),
  };
}

/**
 * Parse "at 8 am" / "8:30pm" from a task prompt so "Everyday at 8 am …" lands at 8:00.
 */
export function parseClockFromText(text: string): { hour: number; minute: number } | null {
  const m =
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(text) ||
    /\bat\s+(\d{1,2}):(\d{2})\b/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (ap === "am") {
    if (hour === 12) hour = 0;
  } else if (ap === "pm") {
    if (hour < 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function inferScheduleOptions(
  prompt: string,
  fallback: TaskScheduleOptions = {},
): Required<Pick<TaskScheduleOptions, "timeZone" | "hour" | "minute">> {
  const clock = parseClockFromText(prompt);
  return {
    timeZone: resolveTaskTimeZone(fallback.timeZone),
    hour: clock?.hour ?? clampHour(fallback.hour, DEFAULT_DAILY_HOUR),
    minute: clock?.minute ?? clampMinute(fallback.minute, DEFAULT_DAILY_MINUTE),
  };
}

function nextZonedOccurrence(
  from: Date,
  opts: { timeZone: string; hour: number; minute: number; weekdays?: number[] },
): Date {
  const zone = resolveTaskTimeZone(opts.timeZone);
  const p = partsInTimeZone(from, zone);
  const baseNoonUtc = Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);

  for (let add = 0; add <= 14; add++) {
    const civil = new Date(baseNoonUtc);
    civil.setUTCDate(civil.getUTCDate() + add);
    const year = civil.getUTCFullYear();
    const month = civil.getUTCMonth() + 1;
    const day = civil.getUTCDate();
    if (opts.weekdays && opts.weekdays.length > 0) {
      const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
      if (!opts.weekdays.includes(weekday)) continue;
    }
    const candidate = zonedLocalToUtc(year, month, day, opts.hour, opts.minute, zone);
    if (candidate.getTime() > from.getTime()) return candidate;
  }

  const fallback = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return fallback;
}

/** Compute the next run time after `from`. Daily/weekly use local 8:00 unless overridden. */
export function computeNextRunAt(
  schedule: TaskSchedulePreset,
  from: Date = new Date(),
  options: TaskScheduleOptions = {},
): string {
  if (schedule === "hourly") {
    const d = new Date(from.getTime());
    d.setUTCMinutes(0, 0, 0);
    d.setUTCHours(d.getUTCHours() + 1);
    return d.toISOString();
  }

  const timeZone = resolveTaskTimeZone(options.timeZone);
  const hour = clampHour(options.hour, DEFAULT_DAILY_HOUR);
  const minute = clampMinute(options.minute, DEFAULT_DAILY_MINUTE);

  return nextZonedOccurrence(from, {
    timeZone,
    hour,
    minute,
    weekdays: schedule === "weekly" ? [1] : undefined,
  }).toISOString();
}

export function scheduleLabel(
  schedule: TaskSchedulePreset,
  options: TaskScheduleOptions = {},
): string {
  const hour = clampHour(options.hour, DEFAULT_DAILY_HOUR);
  const minute = clampMinute(options.minute, DEFAULT_DAILY_MINUTE);
  const zone = resolveTaskTimeZone(options.timeZone);
  const clock = formatClock12(hour, minute);
  switch (schedule) {
    case "hourly":
      return "Every hour";
    case "daily":
      return `Daily at ${clock} (${zone})`;
    case "weekly":
      return `Weekly (Mon ${clock}, ${zone})`;
    default:
      return schedule;
  }
}
