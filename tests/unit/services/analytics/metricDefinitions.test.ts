/**
 * ANALYTICS-FLEXIBILITY-CS-1 — canonical metric math. These definitions are
 * shared by the legacy overview and the flexible query engine; parity between
 * the two engines is pinned separately in analyticsQueryParity.test.ts.
 */
import {
  EMPTY_RUN_AGGREGATE,
  avgDurationMsOrNull,
  deriveMeasureValue,
  runDurationMs,
  successRateOrNull,
} from "@/services/analytics/metricDefinitions";

describe("runDurationMs", () => {
  it("is finished − started", () => {
    expect(
      runDurationMs("2026-07-01T00:00:00.000Z", "2026-07-01T00:00:02.500Z"),
    ).toBe(2500);
  });
  it("clamps negative (clock skew) durations to 0, never negative", () => {
    expect(
      runDurationMs("2026-07-01T00:00:10.000Z", "2026-07-01T00:00:05.000Z"),
    ).toBe(0);
  });
  it("returns null for unfinished or unparseable rows", () => {
    expect(runDurationMs("2026-07-01T00:00:00Z", null)).toBeNull();
    expect(runDurationMs("garbage", "2026-07-01T00:00:00Z")).toBeNull();
  });
});

describe("successRateOrNull — canonical zero-run rule", () => {
  it("is succeeded / (succeeded + failed)", () => {
    expect(successRateOrNull(2, 1)).toBeCloseTo(2 / 3, 10);
    expect(successRateOrNull(0, 4)).toBe(0);
    expect(successRateOrNull(3, 0)).toBe(1);
  });
  it("returns null (not 0) when there are no terminal runs", () => {
    expect(successRateOrNull(0, 0)).toBeNull();
  });
});

describe("avgDurationMsOrNull", () => {
  it("rounds the mean over finished runs", () => {
    expect(avgDurationMsOrNull(301, 2)).toBe(151);
  });
  it("returns null when no finished runs contribute", () => {
    expect(avgDurationMsOrNull(0, 0)).toBeNull();
  });
});

describe("deriveMeasureValue", () => {
  const base = { runs: 5, succeeded: 3, failed: 2, durSumMs: 1000, durCount: 4 };
  it("derives each measure from one base aggregate", () => {
    expect(deriveMeasureValue("runs", base)).toBe(5);
    expect(deriveMeasureValue("succeeded_runs", base)).toBe(3);
    expect(deriveMeasureValue("failed_runs", base)).toBe(2);
    expect(deriveMeasureValue("success_rate", base)).toBeCloseTo(0.6, 10);
    expect(deriveMeasureValue("avg_duration_ms", base)).toBe(250);
  });
  it("empty aggregate: counts are honest 0, rate/duration are null", () => {
    expect(deriveMeasureValue("runs", EMPTY_RUN_AGGREGATE)).toBe(0);
    expect(deriveMeasureValue("succeeded_runs", EMPTY_RUN_AGGREGATE)).toBe(0);
    expect(deriveMeasureValue("failed_runs", EMPTY_RUN_AGGREGATE)).toBe(0);
    expect(deriveMeasureValue("success_rate", EMPTY_RUN_AGGREGATE)).toBeNull();
    expect(deriveMeasureValue("avg_duration_ms", EMPTY_RUN_AGGREGATE)).toBeNull();
  });
  it("failed-but-finished runs contribute to duration; unfinished don't", () => {
    // 2 runs, 1 finished (a failed one): durCount reflects finished rows only.
    expect(
      deriveMeasureValue("avg_duration_ms", {
        runs: 2,
        succeeded: 1,
        failed: 1,
        durSumMs: 800,
        durCount: 1,
      }),
    ).toBe(800);
  });
});
