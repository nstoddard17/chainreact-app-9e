/**
 * ANALYTICS-FLEXIBILITY-CS-1 — PARITY PIN between the two analytics engines.
 *
 * The legacy overview (buildAnalyticsOverview, JS reduce over rows) and the
 * flexible query path (analytics_runs_aggregate SQL → metricDefinitions
 * derivation) must agree on metric SEMANTICS: run counts, succeeded/failed,
 * success rate, average duration, and test-run exclusion over the same window.
 *
 * The test reduces one shared fixture two ways:
 *   1. through the REAL buildAnalyticsOverview, and
 *   2. through a reference reducer that mirrors the RPC's SQL semantics
 *      (terminal-only, is_test filter, [from,to) window, duration sum/count)
 *      followed by the REAL shared deriveMeasureValue.
 * If either side changes definition without the other, this fails.
 *
 * Fixture runs sit strictly INSIDE the window so the known boundary divergence
 * (legacy in-range test includes `until`; the query path is exclusive) can't
 * mask a real drift — that divergence is documented in the CS-1 outcome doc.
 */
import {
  buildAnalyticsOverview,
  computeRangeWindow,
} from "@/services/analytics/analyticsOverview";
import {
  deriveMeasureValue,
  runDurationMs,
  type RunBaseAggregate,
} from "@/services/analytics/metricDefinitions";
import type { AnalyticsRunRow } from "@/repositories/workflowRuns";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const WF_A = "11111111-1111-4111-8111-111111111111";
const WF_B = "22222222-2222-4222-8222-222222222222";

function run(
  id: string,
  workflowId: string,
  status: "succeeded" | "failed",
  startedAt: string,
  finishedAt: string | null,
  isTest = false,
): AnalyticsRunRow {
  return { id, workflowId, status, startedAt, finishedAt, isTest };
}

/** Mirrors the RPC's row semantics over an in-memory fixture. */
function referenceAggregate(
  rows: readonly AnalyticsRunRow[],
  fromMs: number,
  toMs: number,
  includeTests: boolean,
): RunBaseAggregate {
  let runs = 0;
  let succeeded = 0;
  let failed = 0;
  let durSumMs = 0;
  let durCount = 0;
  for (const r of rows) {
    if (!includeTests && r.isTest) continue;
    const t = Date.parse(r.startedAt);
    if (Number.isNaN(t) || t < fromMs || t >= toMs) continue; // [from, to)
    runs += 1;
    if (r.status === "succeeded") succeeded += 1;
    else failed += 1;
    const d = runDurationMs(r.startedAt, r.finishedAt);
    if (d !== null) {
      durSumMs += d;
      durCount += 1;
    }
  }
  return { runs, succeeded, failed, durSumMs, durCount };
}

describe("overview ↔ query-engine metric parity", () => {
  // Mixed fixture: successes, failures, an unfinished failure, a clock-skewed
  // run, and a test run — all strictly inside the 7d window.
  const fixture: AnalyticsRunRow[] = [
    run("r1", WF_A, "succeeded", "2026-07-12T10:00:00.000Z", "2026-07-12T10:00:02.000Z"),
    run("r2", WF_A, "succeeded", "2026-07-13T10:00:00.000Z", "2026-07-13T10:00:04.000Z"),
    run("r3", WF_B, "failed", "2026-07-13T11:00:00.000Z", "2026-07-13T11:00:10.000Z"),
    run("r4", WF_B, "failed", "2026-07-14T09:00:00.000Z", null), // unfinished
    run("r5", WF_A, "succeeded", "2026-07-14T10:00:00.000Z", "2026-07-14T09:59:59.000Z"), // skew → 0ms
    run("r6", WF_A, "succeeded", "2026-07-14T12:00:00.000Z", "2026-07-14T12:00:01.000Z", true), // test
  ];

  const { since, until } = computeRangeWindow("7d", NOW);

  const overview = buildAnalyticsOverview({
    range: "7d",
    now: NOW,
    runs: fixture,
    workflows: [
      { id: WF_A, name: "A", state: "active" },
      { id: WF_B, name: "B", state: "active" },
    ],
    apps: [],
    truncated: false,
  });

  const base = referenceAggregate(fixture, since, until, false);

  it("agrees on run / succeeded / failed counts (test runs excluded)", () => {
    expect(overview.totals.runs).toBe(deriveMeasureValue("runs", base));
    expect(overview.totals.succeeded).toBe(deriveMeasureValue("succeeded_runs", base));
    expect(overview.totals.failed).toBe(deriveMeasureValue("failed_runs", base));
    // The fixture's test run was excluded by BOTH sides.
    expect(overview.totals.runs).toBe(5);
  });

  it("agrees on the success-rate formula", () => {
    const derived = deriveMeasureValue("success_rate", base);
    expect(derived).not.toBeNull();
    expect(overview.totals.successRate).toBeCloseTo(derived as number, 10);
  });

  it("agrees on average duration (unfinished excluded, skew clamped)", () => {
    // Finished: 2000 + 4000 + 10000 + 0 over 4 runs = 4000ms.
    expect(deriveMeasureValue("avg_duration_ms", base)).toBe(4000);
    expect(overview.totals.avgDurationMs).toBe(4000);
  });

  it("test-run INCLUSION also stays in step", () => {
    const withTests = referenceAggregate(fixture, since, until, true);
    expect(withTests.runs).toBe(6);
    // The overview has no include-tests mode (fixed production view) — pin that
    // its exclusion matches the query path's DEFAULT (includeTests: false).
    expect(overview.totals.runs).toBe(base.runs);
  });

  it("pins the documented zero-run coercion at the overview edge", () => {
    const empty = buildAnalyticsOverview({
      range: "7d",
      now: NOW,
      runs: [],
      workflows: [],
      apps: [],
      truncated: false,
    });
    // Canonical rule (query path): null. Legacy overview contract: 0 — the
    // coercion lives at ONE documented edge (totalsFor).
    expect(
      deriveMeasureValue("success_rate", referenceAggregate([], since, until, false)),
    ).toBeNull();
    expect(empty.totals.successRate).toBe(0);
    expect(empty.totals.avgDurationMs).toBeNull();
  });
});
