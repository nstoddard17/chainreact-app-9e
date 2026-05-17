/**
 * @jest-environment node
 *
 * Tests for core/triggers/cronHumanizer — Slice 3.3.
 *
 * The humanizer is the client-side mirror of services/cron/cronExpression;
 * the validity contract must match the server (5-field UTC, no presets,
 * no 6-field). Upcoming-fire computations are timezone-agnostic at the
 * caller — output Dates are UTC instants.
 */

import {
  computeUpcomingFireTimes,
  formatUtcFireTime,
  isValidCronExpression,
} from "@/core/triggers/cronHumanizer";

describe("isValidCronExpression", () => {
  it.each([
    "*/5 * * * *",
    "0 9 * * 1-5",
    "0 0 1 * *",
    "30 8 * * 1,3,5",
    "*/10 9-17 * * 1-5",
  ])("accepts %s", (expr) => {
    expect(isValidCronExpression(expr)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "0 9 * *", // 4 fields
    "0 0 1 1 1 *", // 6 fields
    "@hourly",
    "@daily",
    "@yearly",
    "not-a-cron",
    "99 99 99 99 99",
  ])("rejects %s", (expr) => {
    expect(isValidCronExpression(expr)).toBe(false);
  });

  it("rejects non-string inputs defensively", () => {
    // @ts-expect-error — runtime safety
    expect(isValidCronExpression(undefined)).toBe(false);
    // @ts-expect-error — runtime safety
    expect(isValidCronExpression(null)).toBe(false);
    // @ts-expect-error — runtime safety
    expect(isValidCronExpression(123)).toBe(false);
  });
});

describe("computeUpcomingFireTimes", () => {
  // 2026-05-17 is a Sunday. UTC throughout.
  const NOW = new Date("2026-05-17T08:00:00.000Z");

  it("returns null for invalid expressions", () => {
    expect(computeUpcomingFireTimes("@daily", NOW)).toBeNull();
    expect(computeUpcomingFireTimes("not-cron", NOW)).toBeNull();
    expect(computeUpcomingFireTimes("", NOW)).toBeNull();
  });

  it("returns the next N fire times for a valid weekday-9am expression", () => {
    // 0 9 * * 1-5 = 9am UTC, Mon-Fri.
    // From 2026-05-17 (Sun) 08:00, next fires are Mon 2026-05-18 09:00,
    // Tue 2026-05-19 09:00.
    const fires = computeUpcomingFireTimes("0 9 * * 1-5", NOW, 2);
    expect(fires).not.toBeNull();
    expect(fires).toHaveLength(2);
    expect(fires![0]!.toISOString()).toBe("2026-05-18T09:00:00.000Z");
    expect(fires![1]!.toISOString()).toBe("2026-05-19T09:00:00.000Z");
  });

  it("clamps limit to [1, 10]", () => {
    expect(computeUpcomingFireTimes("*/15 * * * *", NOW, 0)).toHaveLength(1);
    expect(computeUpcomingFireTimes("*/15 * * * *", NOW, -5)).toHaveLength(1);
    expect(computeUpcomingFireTimes("*/15 * * * *", NOW, 999)).toHaveLength(10);
  });

  it("accepts an epoch-ms number for `now`", () => {
    const fires = computeUpcomingFireTimes("0 9 * * 1-5", NOW.getTime(), 1);
    expect(fires).not.toBeNull();
    expect(fires![0]!.toISOString()).toBe("2026-05-18T09:00:00.000Z");
  });

  it("each successive fire is strictly later than the previous one", () => {
    const fires = computeUpcomingFireTimes("*/5 * * * *", NOW, 5);
    expect(fires).not.toBeNull();
    expect(fires).toHaveLength(5);
    for (let i = 1; i < fires!.length; i++) {
      expect(fires![i]!.getTime()).toBeGreaterThan(fires![i - 1]!.getTime());
    }
  });
});

describe("formatUtcFireTime", () => {
  it("formats a UTC date with explicit UTC suffix", () => {
    const out = formatUtcFireTime(new Date("2026-05-18T09:00:00.000Z"));
    // The exact formatting depends on Intl, but must include "UTC"
    // and the year + month/day.
    expect(out).toMatch(/UTC$/);
    expect(out).toContain("2026");
    expect(out).toMatch(/May/);
    expect(out).toContain("09:00");
  });

  it("does NOT include a 12-hour AM/PM marker (hour12: false)", () => {
    const out = formatUtcFireTime(new Date("2026-05-18T15:00:00.000Z"));
    expect(out).not.toMatch(/AM|PM/i);
    expect(out).toContain("15:00");
  });
});
