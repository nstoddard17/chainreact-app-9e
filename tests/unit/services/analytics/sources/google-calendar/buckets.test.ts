/**
 * @jest-environment node
 *
 * Pure Google Calendar analytics bucketing + validation (Slice ANALYTICS-SOURCES-GCAL-1).
 * No I/O. Covers calendar-id validation (default primary), time math, and the
 * sensitive-field-free event projections used by the metrics.
 */

import {
  DOW_LABELS,
  MAX_BUCKETS,
  bucketIndexForMs,
  dateStrToUtcMs,
  dayOfWeekMondayIndex,
  eventDurationHours,
  eventStartDateStr,
  isTimedMeeting,
  parseCalendarId,
  planBuckets,
} from "@/services/analytics/sources/google-calendar/buckets";

describe("planBuckets", () => {
  it("returns [] for an invalid/empty window", () => {
    expect(planBuckets("nope", "nope")).toEqual([]);
    expect(planBuckets("2026-06-05T00:00:00Z", "2026-06-01T00:00:00Z")).toEqual([]);
  });

  it("buckets a short range by day, contiguous", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
    expect(b.map((x) => x.key)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(b[0]!.endMs).toBe(b[1]!.startMs);
  });

  it("never exceeds MAX_BUCKETS for a long range", () => {
    expect(planBuckets("2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z").length).toBeLessThanOrEqual(
      MAX_BUCKETS,
    );
  });
});

describe("parseCalendarId", () => {
  it("defaults to primary when blank/undefined", () => {
    expect(parseCalendarId(undefined)).toBe("primary");
    expect(parseCalendarId("")).toBe("primary");
    expect(parseCalendarId(null)).toBe("primary");
  });
  it("accepts primary, emails, and group calendar ids", () => {
    expect(parseCalendarId("primary")).toBe("primary");
    expect(parseCalendarId("me@example.com")).toBe("me@example.com");
    expect(parseCalendarId("abc123@group.calendar.google.com")).toBe(
      "abc123@group.calendar.google.com",
    );
  });
  it("rejects whitespace / control-char / over-long values", () => {
    expect(() => parseCalendarId("has space")).toThrow();
    expect(() => parseCalendarId("a\nb")).toThrow();
    expect(() => parseCalendarId("x".repeat(257))).toThrow();
    expect(() => parseCalendarId(42)).toThrow();
  });
});

describe("event projections (time/status only)", () => {
  it("isTimedMeeting: timed + non-cancelled only", () => {
    expect(isTimedMeeting({ startDateTime: "2026-06-01T10:00:00Z", status: "confirmed" })).toBe(true);
    expect(isTimedMeeting({ startDateTime: "2026-06-01T10:00:00Z", status: "cancelled" })).toBe(false);
    // all-day event (no dateTime) is not a meeting
    expect(isTimedMeeting({ status: "confirmed" })).toBe(false);
  });

  it("eventDurationHours: positive timed span, else null", () => {
    expect(
      eventDurationHours({ startDateTime: "2026-06-01T10:00:00Z", endDateTime: "2026-06-01T11:30:00Z" }),
    ).toBeCloseTo(1.5);
    expect(eventDurationHours({ startDateTime: "2026-06-01T10:00:00Z" })).toBeNull();
    expect(
      eventDurationHours({ startDateTime: "2026-06-01T11:00:00Z", endDateTime: "2026-06-01T10:00:00Z" }),
    ).toBeNull();
  });

  it("eventStartDateStr: wall-clock date prefix", () => {
    expect(eventStartDateStr({ startDateTime: "2026-06-10T14:00:00-05:00" })).toBe("2026-06-10");
    expect(eventStartDateStr({})).toBeNull();
  });

  it("dayOfWeekMondayIndex: Monday-first, aligned to DOW_LABELS", () => {
    // 2026-06-15 is a Monday.
    expect(dayOfWeekMondayIndex("2026-06-15")).toBe(0);
    expect(DOW_LABELS[0]).toBe("Mon");
    // 2026-06-21 is a Sunday.
    expect(dayOfWeekMondayIndex("2026-06-21")).toBe(6);
    expect(DOW_LABELS[6]).toBe("Sun");
  });

  it("bucketIndexForMs maps via dateStrToUtcMs", () => {
    const b = planBuckets("2026-06-01T00:00:00Z", "2026-06-03T00:00:00Z");
    const ms = dateStrToUtcMs("2026-06-02")!;
    expect(bucketIndexForMs(b, ms)).toBe(1);
    expect(bucketIndexForMs(b, dateStrToUtcMs("2030-01-01")!)).toBe(-1);
  });
});
