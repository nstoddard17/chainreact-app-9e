import {
  INSIGHT_RANGE_PRESETS,
  availableGrains,
  customRangeToWireRange,
  customRangeWindow,
  describeWindow,
  formatUtcDate,
  inclusiveEndToExclusiveMs,
  isGrainAvailable,
  presetLabel,
  presetsWithinLimit,
  previousPeriodWindow,
  rangeSpanDays,
  resolvePresetWindow,
  validateCustomRange,
  type InsightRangePreset,
} from "@/core/analytics/insightRange";

/**
 * CD-5A — canonical Insight date semantics.
 *
 * The load-bearing claim here is the INCLUSIVE END DATE: a person who picks
 * "to July 31" means July 31 counts. Before CD-5A that date went onto a
 * half-open wire unchanged and the whole day vanished. These tests pin the
 * translation, the preset windows, and the previous-period definition that the
 * builder, the query translator and the server all now share.
 */

const DAY = 86_400_000;
// A deliberately mid-day instant so "today" can't accidentally pass by being
// midnight already.
const NOW = Date.parse("2026-07-15T13:45:30.000Z");

describe("range presets", () => {
  it("resolves every declared preset to a UTC [from, to) window", () => {
    for (const preset of INSIGHT_RANGE_PRESETS) {
      const { fromMs, toMs } = resolvePresetWindow(preset.id, NOW);
      expect(Number.isFinite(fromMs)).toBe(true);
      expect(Number.isFinite(toMs)).toBe(true);
      expect(fromMs).toBeLessThan(toMs);
    }
  });

  it("keeps the pre-CD-5A presets meaning exactly what they meant", () => {
    // Saved widgets must not shift under users when the enum widened.
    expect(resolvePresetWindow("today", NOW)).toEqual({
      fromMs: Date.parse("2026-07-15T00:00:00.000Z"),
      toMs: NOW,
    });
    expect(resolvePresetWindow("7d", NOW)).toEqual({ fromMs: NOW - 7 * DAY, toMs: NOW });
    expect(resolvePresetWindow("30d", NOW)).toEqual({ fromMs: NOW - 30 * DAY, toMs: NOW });
    expect(resolvePresetWindow("90d", NOW)).toEqual({ fromMs: NOW - 90 * DAY, toMs: NOW });
    expect(resolvePresetWindow("ytd", NOW)).toEqual({
      fromMs: Date.parse("2026-01-01T00:00:00.000Z"),
      toMs: NOW,
    });
  });

  it("anchors the calendar presets to UTC day/month starts", () => {
    expect(resolvePresetWindow("yesterday", NOW)).toEqual({
      fromMs: Date.parse("2026-07-14T00:00:00.000Z"),
      toMs: Date.parse("2026-07-15T00:00:00.000Z"),
    });
    expect(resolvePresetWindow("this_month", NOW)).toEqual({
      fromMs: Date.parse("2026-07-01T00:00:00.000Z"),
      toMs: NOW,
    });
    expect(resolvePresetWindow("last_month", NOW)).toEqual({
      fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
      toMs: Date.parse("2026-07-01T00:00:00.000Z"),
    });
    expect(resolvePresetWindow("12m", NOW)).toEqual({ fromMs: NOW - 365 * DAY, toMs: NOW });
  });

  it("crosses a year boundary without leaving the calendar", () => {
    const janFirst = Date.parse("2026-01-01T09:00:00.000Z");
    expect(resolvePresetWindow("last_month", janFirst)).toEqual({
      fromMs: Date.parse("2025-12-01T00:00:00.000Z"),
      toMs: Date.parse("2026-01-01T00:00:00.000Z"),
    });
    expect(resolvePresetWindow("yesterday", janFirst)).toEqual({
      fromMs: Date.parse("2025-12-31T00:00:00.000Z"),
      toMs: Date.parse("2026-01-01T00:00:00.000Z"),
    });
  });

  it("handles a leap day as an ordinary calendar day", () => {
    const leap = Date.parse("2028-02-29T12:00:00.000Z");
    expect(resolvePresetWindow("yesterday", leap)).toEqual({
      fromMs: Date.parse("2028-02-28T00:00:00.000Z"),
      toMs: Date.parse("2028-02-29T00:00:00.000Z"),
    });
    expect(resolvePresetWindow("this_month", leap)).toEqual({
      fromMs: Date.parse("2028-02-01T00:00:00.000Z"),
      toMs: leap,
    });
  });

  it("never offers a preset a dataset's ceiling could not accept", () => {
    const ids = presetsWithinLimit(30).map((p) => p.id);
    expect(ids).toContain("30d");
    expect(ids).toContain("today");
    expect(ids).not.toContain("90d");
    expect(ids).not.toContain("ytd");
    expect(ids).not.toContain("12m");
    // Every preset fits the platform's 366-day contract ceiling.
    expect(presetsWithinLimit(366)).toHaveLength(INSIGHT_RANGE_PRESETS.length);
  });

  it("stays inside the 366-day contract ceiling for every preset", () => {
    for (const preset of INSIGHT_RANGE_PRESETS) {
      expect(preset.maxSpanDays).toBeLessThanOrEqual(366);
    }
  });

  it("labels presets in plain language", () => {
    expect(presetLabel("12m")).toBe("Last 12 months");
    expect(presetLabel("last_month")).toBe("Last month");
  });
});

describe("custom range — the end date is inclusive", () => {
  it("counts the whole of the picked end day", () => {
    // The bug this fixes: "to 2026-07-31" used to stop at July 31 00:00.
    expect(inclusiveEndToExclusiveMs("2026-07-31")).toBe(
      Date.parse("2026-08-01T00:00:00.000Z"),
    );
    const window = customRangeWindow("2026-07-01", "2026-07-31");
    expect(window).toEqual({
      fromMs: Date.parse("2026-07-01T00:00:00.000Z"),
      toMs: Date.parse("2026-08-01T00:00:00.000Z"),
    });
    expect((window!.toMs - window!.fromMs) / DAY).toBe(31);
  });

  it("treats start === end as a valid single day", () => {
    expect(validateCustomRange("2026-07-15", "2026-07-15", 366)).toBeNull();
    const window = customRangeWindow("2026-07-15", "2026-07-15");
    expect((window!.toMs - window!.fromMs) / DAY).toBe(1);
  });

  it("includes the leap day when it is the end date", () => {
    const window = customRangeWindow("2028-02-01", "2028-02-29");
    expect(window!.toMs).toBe(Date.parse("2028-03-01T00:00:00.000Z"));
    expect((window!.toMs - window!.fromMs) / DAY).toBe(29);
  });

  it("passes an explicit instant through untouched", () => {
    // Already an exclusive boundary — adding a day would double-count.
    const instant = "2026-08-01T00:00:00.000Z";
    expect(inclusiveEndToExclusiveMs(instant)).toBe(Date.parse(instant));
  });

  it("puts the exclusive boundary on the wire and keeps the picked date stored", () => {
    expect(customRangeToWireRange("2026-07-01", "2026-07-31")).toEqual({
      from: "2026-07-01",
      to: "2026-08-01T00:00:00.000Z",
    });
  });

  it("leaves an unparseable range for the server to reject with its own copy", () => {
    expect(customRangeToWireRange("nonsense", "2026-07-31")).toEqual({
      from: "nonsense",
      to: "2026-07-31",
    });
  });
});

describe("custom range validation", () => {
  it("asks for both dates when either is missing or unparseable", () => {
    expect(validateCustomRange("", "2026-07-31", 366)).toMatch(/both a start and an end/i);
    expect(validateCustomRange("2026-07-01", "", 366)).toMatch(/both a start and an end/i);
    expect(validateCustomRange("nope", "2026-07-31", 366)).toMatch(/both a start and an end/i);
  });

  it("rejects an end before the start", () => {
    expect(validateCustomRange("2026-07-31", "2026-07-01", 366)).toMatch(
      /start date must be on or before the end date/i,
    );
  });

  it("rejects a span past the dataset's ceiling and names the limit", () => {
    expect(validateCustomRange("2026-01-01", "2026-12-31", 90)).toMatch(/at most 90 days/i);
    // Exactly at the ceiling is allowed.
    expect(validateCustomRange("2026-07-01", "2026-07-30", 30)).toBeNull();
    expect(validateCustomRange("2026-07-01", "2026-07-31", 30)).toMatch(/at most 30 days/i);
  });
});

describe("previous period", () => {
  it("is the same-length window immediately before, never overlapping", () => {
    const from = Date.parse("2026-07-01T00:00:00.000Z");
    const to = Date.parse("2026-08-01T00:00:00.000Z"); // July, inclusive of the 31st
    const prev = previousPeriodWindow(from, to);
    expect(prev.toMs).toBe(from); // adjacent
    expect(prev.toMs - prev.fromMs).toBe(to - from); // equal duration
  });

  it("shifts by DURATION, so a 31-day month reaches back past the 1st", () => {
    // DELIBERATE, and it matches what every provider adapter already scans:
    // the previous window is [from − span, from). July is 31 days and June is
    // 30, so July's comparison starts May 31 — comparing 31 days of data
    // against 30 would understate the previous period by a whole day.
    const from = Date.parse("2026-07-01T00:00:00.000Z");
    const to = Date.parse("2026-08-01T00:00:00.000Z");
    expect(previousPeriodWindow(from, to)).toEqual({
      fromMs: Date.parse("2026-05-31T00:00:00.000Z"),
      toMs: from,
    });
  });

  it("handles a single day and a seven-day window", () => {
    const day = customRangeWindow("2026-07-15", "2026-07-15")!;
    expect(previousPeriodWindow(day.fromMs, day.toMs)).toEqual({
      fromMs: Date.parse("2026-07-14T00:00:00.000Z"),
      toMs: Date.parse("2026-07-15T00:00:00.000Z"),
    });
    const week = resolvePresetWindow("7d", NOW);
    const prevWeek = previousPeriodWindow(week.fromMs, week.toMs);
    expect(prevWeek.toMs).toBe(week.fromMs);
    expect(prevWeek.toMs - prevWeek.fromMs).toBe(7 * DAY);
  });

  it("crosses a leap-year boundary by duration, not by calendar name", () => {
    // Mar 1–10 inclusive is 10 days, so the comparison is the 10 days before
    // Mar 1 — which in a leap year reaches Feb 20, not Feb 21.
    const window = customRangeWindow("2028-03-01", "2028-03-10")!;
    const prev = previousPeriodWindow(window.fromMs, window.toMs);
    expect(prev.fromMs).toBe(Date.parse("2028-02-20T00:00:00.000Z"));
    expect(prev.toMs).toBe(Date.parse("2028-03-01T00:00:00.000Z"));
  });
});

describe("time grain availability", () => {
  it("always allows automatic", () => {
    expect(isGrainAvailable("auto", 1)).toBe(true);
    expect(isGrainAvailable("auto", 366)).toBe(true);
  });

  it("refuses a grain coarser than the range itself", () => {
    // Monthly over one day would collapse the chart into a single bucket that
    // pretends to describe a month.
    expect(isGrainAvailable("month", 1)).toBe(false);
    expect(isGrainAvailable("week", 1)).toBe(false);
    expect(isGrainAvailable("day", 1)).toBe(true);
    expect(isGrainAvailable("week", 7)).toBe(true);
    expect(isGrainAvailable("month", 28)).toBe(true);
  });

  it("offers the full ladder once the range is long enough", () => {
    expect(availableGrains(1)).toEqual(["auto", "day"]);
    expect(availableGrains(7)).toEqual(["auto", "day", "week"]);
    expect(availableGrains(90)).toEqual(["auto", "day", "week", "month"]);
  });

  it("measures the span of presets and custom ranges alike", () => {
    expect(rangeSpanDays({ preset: "7d" }, NOW)).toBe(7);
    expect(rangeSpanDays({ preset: "today" }, NOW)).toBe(1);
    expect(rangeSpanDays({ from: "2026-07-01", to: "2026-07-31" }, NOW)).toBe(31);
    expect(rangeSpanDays({ from: "bad", to: "2026-07-31" }, NOW)).toBeNull();
  });
});

describe("human-readable windows", () => {
  it("names the last INCLUDED day, not the exclusive boundary", () => {
    // [Jul 1, Aug 1) is "Jul 1 – Jul 31" to a reader.
    expect(
      describeWindow(
        Date.parse("2026-07-01T00:00:00.000Z"),
        Date.parse("2026-08-01T00:00:00.000Z"),
      ),
    ).toBe("Jul 1, 2026 – Jul 31, 2026");
  });

  it("collapses a single day to one date", () => {
    expect(
      describeWindow(
        Date.parse("2026-07-15T00:00:00.000Z"),
        Date.parse("2026-07-16T00:00:00.000Z"),
      ),
    ).toBe("Jul 15, 2026");
  });

  it("names the day a mid-day rolling window ends on, because it is included", () => {
    const today = resolvePresetWindow("today", NOW);
    expect(describeWindow(today.fromMs, today.toMs)).toBe("Jul 15, 2026");
  });

  it("formats dates in UTC regardless of the host timezone", () => {
    expect(formatUtcDate(Date.parse("2026-01-05T23:59:59.000Z"))).toBe("Jan 5, 2026");
  });
});

describe("preset ids are stable", () => {
  it("still contains every legacy id so saved widgets keep parsing", () => {
    const ids = INSIGHT_RANGE_PRESETS.map((p) => p.id);
    for (const legacy of ["today", "7d", "30d", "90d", "ytd"] satisfies InsightRangePreset[]) {
      expect(ids).toContain(legacy);
    }
  });
});
