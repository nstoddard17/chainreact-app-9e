/**
 * Canonical workflow-run metric definitions (ANALYTICS-FLEXIBILITY-CS-1).
 *
 * ONE home for the math both analytics engines share, so the legacy overview
 * (`analyticsOverview.ts`) and the flexible query engine (`insightQuery.ts`)
 * cannot silently drift:
 *
 *   - success rate  = succeeded / (succeeded + failed); NO TERMINAL RUNS → null.
 *     That null is the CANONICAL zero-run rule. The legacy `AnalyticsOverview`
 *     contract predates it with a non-nullable `successRate` (0 when empty), so
 *     the overview coerces `?? 0` AT ITS EDGE — documented there, pinned by the
 *     parity test (tests/unit/services/analytics/analyticsQueryParity.test.ts).
 *   - avg duration  = round(Σ duration / count) over runs WITH a finished_at;
 *     unfinished rows are excluded from the denominator; no finished runs → null.
 *   - run duration  = finished_at − started_at, clamped ≥ 0 (a clock-skewed
 *     negative interval reads as 0, never a negative analytic); unparseable or
 *     missing timestamps → null (excluded from averages).
 *
 * Terminal-status domain is exactly `succeeded | failed` (no canceled state);
 * "failed" therefore means every non-succeeded terminal run. `running`/`queued`
 * rows are excluded at the read layer. Retries are ordinary run facts
 * (`triggered_by = 'retry'`) — never deduplicated.
 *
 * PURE — no I/O, no Date.now(). Keep it that way.
 */

/** Run duration in ms; null when unfinished/unparseable; clamped ≥ 0. */
export function runDurationMs(
  startedAt: string,
  finishedAt: string | null,
): number | null {
  if (!finishedAt) return null;
  const s = Date.parse(startedAt);
  const f = Date.parse(finishedAt);
  if (Number.isNaN(s) || Number.isNaN(f)) return null;
  return f >= s ? f - s : 0;
}

/** Canonical success rate (0..1). null when there are no terminal runs. */
export function successRateOrNull(
  succeeded: number,
  failed: number,
): number | null {
  const total = succeeded + failed;
  return total > 0 ? succeeded / total : null;
}

/** Canonical average duration (rounded ms). null when no finished runs. */
export function avgDurationMsOrNull(
  durSumMs: number,
  durCount: number,
): number | null {
  return durCount > 0 ? Math.round(durSumMs / durCount) : null;
}

/** The base aggregate every measure derives from (mirrors the RPC row). */
export interface RunBaseAggregate {
  runs: number;
  succeeded: number;
  failed: number;
  durSumMs: number;
  durCount: number;
}

export const EMPTY_RUN_AGGREGATE: RunBaseAggregate = {
  runs: 0,
  succeeded: 0,
  failed: 0,
  durSumMs: 0,
  durCount: 0,
};

/**
 * Derive a measure value from a base aggregate. Count measures over an empty
 * aggregate are an honest 0; rate/duration over an empty aggregate are null
 * (0% success or 0ms duration would be a lie).
 */
export function deriveMeasureValue(
  measure:
    | "runs"
    | "succeeded_runs"
    | "failed_runs"
    | "success_rate"
    | "avg_duration_ms",
  base: RunBaseAggregate,
): number | null {
  switch (measure) {
    case "runs":
      return base.runs;
    case "succeeded_runs":
      return base.succeeded;
    case "failed_runs":
      return base.failed;
    case "success_rate":
      return successRateOrNull(base.succeeded, base.failed);
    case "avg_duration_ms":
      return avgDurationMsOrNull(base.durSumMs, base.durCount);
  }
}
