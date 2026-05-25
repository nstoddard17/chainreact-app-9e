/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — date-range preset resolution + report-row
 * normalization helpers.
 */
import {
  resolveDateRange,
  normalizeReportRows,
} from "@/integrations/google-analytics/actions/_dateRange";

const NOW = new Date("2026-05-15T12:00:00Z");

describe("resolveDateRange", () => {
  it("today / yesterday", () => {
    expect(resolveDateRange("today", undefined, undefined, NOW)).toEqual({
      startDate: "2026-05-15",
      endDate: "2026-05-15",
    });
    expect(resolveDateRange("yesterday", undefined, undefined, NOW)).toEqual({
      startDate: "2026-05-14",
      endDate: "2026-05-14",
    });
  });

  it("last_7_days / last_30_days end today", () => {
    expect(resolveDateRange("last_7_days", undefined, undefined, NOW)).toEqual({
      startDate: "2026-05-08",
      endDate: "2026-05-15",
    });
    expect(resolveDateRange("last_30_days", undefined, undefined, NOW)).toEqual({
      startDate: "2026-04-15",
      endDate: "2026-05-15",
    });
  });

  it("this_month / last_month", () => {
    expect(resolveDateRange("this_month", undefined, undefined, NOW)).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-05-15",
    });
    expect(resolveDateRange("last_month", undefined, undefined, NOW)).toEqual({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
  });

  it("custom passes through explicit dates; throws without them", () => {
    expect(resolveDateRange("custom", "2026-01-01", "2026-01-31", NOW)).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(() => resolveDateRange("custom", undefined, undefined, NOW)).toThrow();
  });
});

describe("normalizeReportRows", () => {
  it("zips dimension/metric headers with row values (metrics parsed to numbers)", () => {
    const rows = normalizeReportRows({
      dimensionHeaders: [{ name: "date" }, { name: "country" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [
        { dimensionValues: [{ value: "20260501" }, { value: "US" }], metricValues: [{ value: "12" }] },
        { dimensionValues: [{ value: "20260502" }, { value: "CA" }], metricValues: [{ value: "3" }] },
      ],
    });
    expect(rows).toEqual([
      { date: "20260501", country: "US", sessions: 12 },
      { date: "20260502", country: "CA", sessions: 3 },
    ]);
  });

  it("returns [] for an empty report", () => {
    expect(normalizeReportRows({})).toEqual([]);
  });
});
