/** @jest-environment node */
/**
 * Pure bucketing + event helpers for the Outlook Calendar analytics source
 * (Slice ANALYTICS-SOURCES-OUTLOOK-CAL-1). No I/O.
 */

import {
  bucketIndexForMs,
  dayOfWeekMondayIndex,
  eventDurationHours,
  eventStartDateStr,
  isTimedMeeting,
  normalizeGraphUtc,
  parseCalendarId,
  planBuckets,
} from "@/services/analytics/sources/microsoft-outlook-calendar/buckets";

describe("planBuckets / bucketIndexForMs", () => {
  it("day-buckets a short range and maps a ms into its bucket", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-04T00:00:00Z");
    expect(b.length).toBe(4);
    expect(bucketIndexForMs(b, Date.parse("2026-06-02T08:00:00Z"))).toBe(1);
    expect(bucketIndexForMs(b, Date.parse("2026-05-01T00:00:00Z"))).toBe(-1);
  });

  it("returns [] for an invalid / inverted range", () => {
    expect(planBuckets("nope", "2026-06-04T00:00:00Z")).toEqual([]);
    expect(planBuckets("2026-06-04T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });
});

describe("normalizeGraphUtc", () => {
  it("appends Z to an offset-less Graph datetime", () => {
    expect(normalizeGraphUtc("2026-06-01T14:30:00.0000000")).toBe("2026-06-01T14:30:00.0000000Z");
  });
  it("leaves a value that already has Z / an offset", () => {
    expect(normalizeGraphUtc("2026-06-01T14:30:00Z")).toBe("2026-06-01T14:30:00Z");
    expect(normalizeGraphUtc("2026-06-01T14:30:00+02:00")).toBe("2026-06-01T14:30:00+02:00");
  });
});

describe("parseCalendarId (optional — blank = primary)", () => {
  it("blank / null / undefined → null (primary)", () => {
    expect(parseCalendarId("")).toBeNull();
    expect(parseCalendarId(null)).toBeNull();
    expect(parseCalendarId(undefined)).toBeNull();
  });
  it("accepts a Graph base64url calendar id", () => {
    expect(parseCalendarId("AQMkAD_123-xyz=")).toBe("AQMkAD_123-xyz=");
  });
  it("rejects injection / whitespace / overlong values", () => {
    expect(() => parseCalendarId("bad id")).toThrow();
    expect(() => parseCalendarId("a/b")).toThrow();
    expect(() => parseCalendarId(42)).toThrow();
    expect(() => parseCalendarId("x".repeat(257))).toThrow();
  });
});

describe("event helpers", () => {
  it("isTimedMeeting excludes all-day, cancelled, and start-less events", () => {
    expect(isTimedMeeting({ startDateTime: "2026-06-01T09:00:00Z", endDateTime: "2026-06-01T10:00:00Z" })).toBe(true);
    expect(isTimedMeeting({ startDateTime: "2026-06-01T09:00:00Z", isAllDay: true })).toBe(false);
    expect(isTimedMeeting({ startDateTime: "2026-06-01T09:00:00Z", isCancelled: true })).toBe(false);
    expect(isTimedMeeting({})).toBe(false);
  });

  it("eventStartDateStr + eventDurationHours read time only", () => {
    const ev = { startDateTime: "2026-06-01T09:00:00Z", endDateTime: "2026-06-01T10:30:00Z" };
    expect(eventStartDateStr(ev)).toBe("2026-06-01");
    expect(eventDurationHours(ev)).toBeCloseTo(1.5);
    expect(eventDurationHours({ startDateTime: "2026-06-01T10:00:00Z", endDateTime: "2026-06-01T09:00:00Z" })).toBeNull();
  });

  it("dayOfWeekMondayIndex is Monday-first", () => {
    // 2026-06-01 is a Monday → 0.
    expect(dayOfWeekMondayIndex("2026-06-01")).toBe(0);
    // 2026-06-07 is a Sunday → 6.
    expect(dayOfWeekMondayIndex("2026-06-07")).toBe(6);
  });
});
