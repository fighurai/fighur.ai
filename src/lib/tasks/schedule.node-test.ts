import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeNextRunAt,
  formatNowInTimeZone,
  parseClockFromText,
  zonedLocalToUtc,
} from "./schedule.ts";

test("parseClockFromText reads everyday at 8 am", () => {
  const clock = parseClockFromText(
    "Everyday at 8 am create a conversation with the latest ai news starting from today's date",
  );
  assert.deepEqual(clock, { hour: 8, minute: 0 });
});

test("parseClockFromText reads 9:30pm", () => {
  assert.deepEqual(parseClockFromText("Weekly at 9:30pm"), { hour: 21, minute: 30 });
});

test("daily next run is 8am America/New_York after a morning instant", () => {
  // Friday Aug 21, 2026 10:00 AM EDT = 14:00 UTC
  const from = new Date("2026-08-21T14:00:00.000Z");
  const next = computeNextRunAt("daily", from, {
    timeZone: "America/New_York",
    hour: 8,
    minute: 0,
  });
  assert.equal(next, "2026-08-22T12:00:00.000Z");
});

test("daily next run is later today when before 8am ET", () => {
  // Saturday Aug 22, 2026 7:00 AM EDT = 11:00 UTC
  const from = new Date("2026-08-22T11:00:00.000Z");
  const next = computeNextRunAt("daily", from, {
    timeZone: "America/New_York",
    hour: 8,
    minute: 0,
  });
  assert.equal(next, "2026-08-22T12:00:00.000Z");
});

test("zonedLocalToUtc maps 8am EDT to 12:00 UTC", () => {
  const d = zonedLocalToUtc(2026, 8, 23, 8, 0, "America/New_York");
  assert.equal(d.toISOString(), "2026-08-23T12:00:00.000Z");
});

test("formatNowInTimeZone uses the real calendar date", () => {
  const clock = formatNowInTimeZone(new Date("2026-08-23T16:00:00.000Z"), "America/New_York");
  assert.equal(clock.isoDate, "2026-08-23");
  assert.match(clock.monthDayYear, /August 23, 2026/);
  assert.doesNotMatch(clock.monthDayYear, /January 14, 2025/);
});
