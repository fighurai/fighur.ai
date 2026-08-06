export type TaskSchedulePreset = "hourly" | "daily" | "weekly";

export const TASK_SCHEDULE_PRESETS: TaskSchedulePreset[] = ["hourly", "daily", "weekly"];

export function isTaskSchedulePreset(v: unknown): v is TaskSchedulePreset {
  return v === "hourly" || v === "daily" || v === "weekly";
}

/** Compute the next run time after `from` (UTC). */
export function computeNextRunAt(
  schedule: TaskSchedulePreset,
  from: Date = new Date(),
): string {
  const d = new Date(from.getTime());
  switch (schedule) {
    case "hourly": {
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      break;
    }
    case "daily": {
      // Next 14:00 UTC (≈ morning US / afternoon EU) — stable daily slot
      d.setUTCMinutes(0, 0, 0);
      d.setUTCSeconds(0, 0);
      if (d.getUTCHours() >= 14) {
        d.setUTCDate(d.getUTCDate() + 1);
      }
      d.setUTCHours(14, 0, 0, 0);
      break;
    }
    case "weekly": {
      // Next Monday 14:00 UTC
      d.setUTCMinutes(0, 0, 0);
      d.setUTCSeconds(0, 0);
      const day = d.getUTCDay(); // 0 Sun … 6 Sat
      let add = (1 - day + 7) % 7; // days until Monday
      if (add === 0 && d.getUTCHours() >= 14) add = 7;
      d.setUTCDate(d.getUTCDate() + add);
      d.setUTCHours(14, 0, 0, 0);
      break;
    }
    default:
      d.setUTCHours(d.getUTCHours() + 1);
  }
  return d.toISOString();
}

export function scheduleLabel(schedule: TaskSchedulePreset): string {
  switch (schedule) {
    case "hourly":
      return "Every hour";
    case "daily":
      return "Daily (14:00 UTC)";
    case "weekly":
      return "Weekly (Mon 14:00 UTC)";
    default:
      return schedule;
  }
}
