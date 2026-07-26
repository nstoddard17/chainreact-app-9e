import type {
  AnalyticsQuery,
  AnalyticsQueryResult,
  AnalyticsResolvedGrain,
  AnalyticsSeriesMeta,
} from "@/contracts/analyticsQuery";
import { ANALYTICS_QUERY_MAX_BUCKETS } from "@/contracts/analyticsQuery";
import {
  bucketStartsFor,
  resolveQueryRange,
  resolveTimeGrain,
  toBuckets,
} from "./insightQueryTime";
import {
  ANALYTICS_MEASURE_CAPABILITIES,
  RUN_STATUS_LABELS,
  TRIGGER_SOURCE_LABELS,
  validateAnalyticsQuery,
  type NormalizedAnalyticsQuery,
} from "@/contracts/analyticsQueryCapabilities";
import {
  EMPTY_RUN_AGGREGATE,
  deriveMeasureValue,
  type RunBaseAggregate,
} from "./metricDefinitions";
import * as analyticsQueriesRepo from "@/repositories/analytics/queries";
import type { AnalyticsAggregateRow } from "@/repositories/analytics/queries";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowAnalyticsRef } from "@/repositories/workflows";

/**
 * Flexible analytics query service (Slice ANALYTICS-FLEXIBILITY-CS-1).
 *
 * The BRAIN of `POST /api/analytics/query`: capability validation → range/grain
 * resolution → workflow-ownership validation → SQL aggregation (via the
 * analytics repository / `analytics_runs_aggregate` RPC) → bounded normalized
 * result. Measure math is NOT here — it lives in `metricDefinitions.ts`,
 * shared with the legacy overview so definitions cannot drift.
 *
 * AUTHORIZATION CONTRACT: `accountId` MUST be the caller's own membership-
 * resolved active account (`requireAccount` at the route). This service then
 * proves every client-named workflow id belongs to that account BEFORE any id
 * reaches SQL; nonexistent and cross-account ids fail with ONE identical
 * non-leaking error (`UNKNOWN_WORKFLOW` — never revealing which id, or why).
 * The account predicate inside the RPC is defense in depth, not the gate.
 *
 * TIME SEMANTICS (this path): UTC; window is [from, to) — inclusive start,
 * EXCLUSIVE end; buckets are UTC calendar truncations (day / ISO-Monday week /
 * month-start); presets reuse the overview's rolling-window semantics
 * (today = UTC-midnight→now, Nd = now−N×24h→now, ytd = Jan-1-UTC→now).
 * The legacy overview's in-range test is inclusive of `until` — a divergence
 * only for a run landing on the exact millisecond boundary; documented in the
 * CS-1 outcome doc. Per-account timezones are a later slice.
 */

/** One shared, non-leaking message for any bad workflow selection. */
export const UNKNOWN_WORKFLOW_MESSAGE =
  "One or more selected workflows were not found.";

export class AnalyticsQueryError extends Error {
  readonly code: "INVALID_QUERY" | "UNKNOWN_WORKFLOW";
  constructor(message: string, code: AnalyticsQueryError["code"]) {
    super(message);
    this.name = "AnalyticsQueryError";
    this.code = code;
  }
}

// ── Aggregation plumbing ─────────────────────────────────────────────────────

function baseOf(row: AnalyticsAggregateRow | undefined): RunBaseAggregate {
  if (!row) return EMPTY_RUN_AGGREGATE;
  return {
    runs: row.runs,
    succeeded: row.succeeded,
    failed: row.failed,
    durSumMs: row.durSumMs,
    durCount: row.durCount,
  };
}

function workflowLabel(ref: WorkflowAnalyticsRef | undefined): string {
  if (!ref) return "Untitled workflow";
  return ref.state === "deleted" ? `${ref.name} (deleted)` : ref.name;
}

function seriesMetaFor(
  dimensionKey: string,
  seriesBy: "workflow" | "status",
  refs: ReadonlyMap<string, WorkflowAnalyticsRef>,
): AnalyticsSeriesMeta {
  if (seriesBy === "status") {
    return {
      id: dimensionKey,
      label: RUN_STATUS_LABELS[dimensionKey] ?? dimensionKey,
      workflowState: null,
    };
  }
  const ref = refs.get(dimensionKey);
  return {
    id: dimensionKey,
    label: workflowLabel(ref),
    workflowState: ref?.state ?? null,
  };
}

function categoricalLabel(
  dimension: "workflow" | "status" | "trigger_source",
  key: string,
  refs: ReadonlyMap<string, WorkflowAnalyticsRef>,
): { label: string; workflowState: string | null } {
  if (dimension === "workflow") {
    const ref = refs.get(key);
    return { label: workflowLabel(ref), workflowState: ref?.state ?? null };
  }
  if (dimension === "status") {
    return { label: RUN_STATUS_LABELS[key] ?? key, workflowState: null };
  }
  return { label: TRIGGER_SOURCE_LABELS[key] ?? key, workflowState: null };
}

/** Values for one series over the seeded buckets (zero- or null-filled). */
function seriesValues(
  starts: readonly number[],
  rowsByKey: ReadonlyMap<string, AnalyticsAggregateRow>,
  measure: NormalizedAnalyticsQuery["measure"],
  emptyBucket: "zero" | "null",
): (number | null)[] {
  return starts.map((s) => {
    const row = rowsByKey.get(String(s));
    if (!row) return emptyBucket === "zero" ? 0 : null;
    return deriveMeasureValue(measure, baseOf(row));
  });
}

function timeRowKey(bucketStartIso: string | null): string {
  const t = bucketStartIso ? Date.parse(bucketStartIso) : Number.NaN;
  return String(t);
}

interface QueryContext {
  accountId: string;
  q: NormalizedAnalyticsQuery;
  fromMs: number;
  toMs: number;
  grain: AnalyticsResolvedGrain | null;
}

function aggregateParams(
  ctx: QueryContext,
  window: { fromMs: number; toMs: number },
  overrides: Partial<analyticsQueriesRepo.AnalyticsAggregateParams> = {},
): analyticsQueriesRepo.AnalyticsAggregateParams {
  const { q } = ctx;
  return {
    accountId: ctx.accountId,
    from: new Date(window.fromMs).toISOString(),
    to: new Date(window.toMs).toISOString(),
    dimension: q.dimension,
    grain: q.dimension === "time" ? ctx.grain : null,
    seriesBy: q.series?.by ?? null,
    workflowIds: q.filters.workflowIds,
    statuses: q.filters.statuses,
    triggerSources: q.filters.triggerSources,
    includeTests: q.filters.includeTests,
    limit: null,
    ...overrides,
  };
}

// ── The service ──────────────────────────────────────────────────────────────

export interface RunAnalyticsQueryOptions {
  /** Injected clock for deterministic tests. */
  now?: number;
}

export async function runAnalyticsQuery(
  accountId: string,
  input: AnalyticsQuery,
  opts: RunAnalyticsQueryOptions = {},
): Promise<AnalyticsQueryResult> {
  const now = opts.now ?? Date.now();

  const validated = validateAnalyticsQuery(input);
  if (!validated.ok) {
    throw new AnalyticsQueryError(validated.reason, "INVALID_QUERY");
  }
  const q = validated.query;
  const cap = ANALYTICS_MEASURE_CAPABILITIES[q.measure];

  const { fromMs, toMs } = resolveQueryRange(q.range, now);
  const grain =
    q.dimension === "time" ? resolveTimeGrain(q.timeGrain ?? "auto", toMs - fromMs) : null;

  if (grain) {
    const count = bucketStartsFor(grain, fromMs, toMs).length;
    if (count > ANALYTICS_QUERY_MAX_BUCKETS) {
      throw new AnalyticsQueryError(
        "This range and grouping would produce too many points — widen the grouping or shorten the range.",
        "INVALID_QUERY",
      );
    }
  }

  // ── Workflow-ownership validation (fail closed, non-leaking) ──────────────
  const requestedIds = Array.from(
    new Set([
      ...(q.filters.workflowIds ?? []),
      ...(q.series?.by === "workflow" && q.series.mode === "explicit"
        ? q.series.ids
        : []),
    ]),
  );
  const workflowRefs = new Map<string, WorkflowAnalyticsRef>();
  if (requestedIds.length > 0) {
    const found = await workflowsRepo.listByIdsForAccount(accountId, requestedIds);
    for (const ref of found) workflowRefs.set(ref.id, ref);
    if (found.length !== requestedIds.length) {
      throw new AnalyticsQueryError(UNKNOWN_WORKFLOW_MESSAGE, "UNKNOWN_WORKFLOW");
    }
  }

  const ctx: QueryContext = { accountId, q, fromMs, toMs, grain };

  // ── KPI ───────────────────────────────────────────────────────────────────
  if (q.dimension === null) {
    const rows = await analyticsQueriesRepo.aggregateRuns(
      aggregateParams(ctx, { fromMs, toMs }),
    );
    const value = deriveMeasureValue(q.measure, baseOf(rows[0]));
    let compare: AnalyticsQueryResult["compare"] = null;
    if (q.compare === "previous_period") {
      const prev = { fromMs: fromMs - (toMs - fromMs), toMs: fromMs };
      const prevRows = await analyticsQueriesRepo.aggregateRuns(
        aggregateParams(ctx, prev),
      );
      compare = {
        previousValue: deriveMeasureValue(q.measure, baseOf(prevRows[0])),
        previousRange: {
          from: new Date(prev.fromMs).toISOString(),
          to: new Date(prev.toMs).toISOString(),
        },
      };
    }
    return {
      kind: "kpi",
      measure: q.measure,
      dimension: null,
      grain: null,
      range: rangeIso(fromMs, toMs),
      includeTests: q.filters.includeTests,
      value,
      compare,
      warnings: [],
      truncated: false,
    };
  }

  // ── Time series ───────────────────────────────────────────────────────────
  if (q.dimension === "time") {
    const resolvedGrain = grain as AnalyticsResolvedGrain;
    const starts = bucketStartsFor(resolvedGrain, fromMs, toMs);

    // Resolve the workflow-series id set (explicit order, or Top-N by runs).
    let seriesIds: string[] | null = null;
    if (q.series?.by === "workflow") {
      if (q.series.mode === "explicit") {
        seriesIds = [...q.series.ids];
      } else {
        const top = await analyticsQueriesRepo.aggregateRuns(
          aggregateParams(ctx, { fromMs, toMs }, {
            dimension: "workflow",
            grain: null,
            seriesBy: null,
            limit: q.series.topN,
          }),
        );
        seriesIds = top
          .map((r) => r.groupKey)
          .filter((k): k is string => k !== null);
        const missing = seriesIds.filter((id) => !workflowRefs.has(id));
        if (missing.length > 0) {
          const refs = await workflowsRepo.listByIdsForAccount(accountId, missing);
          for (const ref of refs) workflowRefs.set(ref.id, ref);
        }
      }
    }

    const rows = await analyticsQueriesRepo.aggregateRuns(
      aggregateParams(ctx, { fromMs, toMs }, {
        workflowIds: seriesIds ?? q.filters.workflowIds,
      }),
    );

    let series: NonNullable<AnalyticsQueryResult["series"]>;
    if (!q.series) {
      const byBucket = new Map(rows.map((r) => [timeRowKey(r.bucketStart), r]));
      series = [
        {
          meta: { id: "total", label: cap.label, workflowState: null },
          values: seriesValues(starts, byBucket, q.measure, cap.emptyBucket),
        },
      ];
    } else {
      const keys =
        q.series.by === "status"
          ? (q.filters.statuses ?? ["succeeded", "failed"])
          : (seriesIds ?? []);
      series = keys.map((key) => {
        const byBucket = new Map(
          rows
            .filter((r) => r.groupKey === key)
            .map((r) => [timeRowKey(r.bucketStart), r]),
        );
        return {
          meta: seriesMetaFor(key, q.series!.by, workflowRefs),
          values: seriesValues(starts, byBucket, q.measure, cap.emptyBucket),
        };
      });
    }

    let compareSeries: AnalyticsQueryResult["compareSeries"] = null;
    if (q.compare === "previous_period") {
      // Validator guarantees single-series (no `series` config) here.
      const prev = { fromMs: fromMs - (toMs - fromMs), toMs: fromMs };
      const prevRows = await analyticsQueriesRepo.aggregateRuns(
        aggregateParams(ctx, prev),
      );
      const prevStarts = bucketStartsFor(resolvedGrain, prev.fromMs, prev.toMs);
      const byBucket = new Map(prevRows.map((r) => [timeRowKey(r.bucketStart), r]));
      const prevValues = seriesValues(prevStarts, byBucket, q.measure, cap.emptyBucket);
      // Index-align to the main buckets (bucket i ↔ previous-window bucket i).
      const aligned = starts.map((_, i) => prevValues[i] ?? null);
      compareSeries = {
        previousRange: {
          from: new Date(prev.fromMs).toISOString(),
          to: new Date(prev.toMs).toISOString(),
        },
        values: aligned,
        // Previous window's own boundaries for previous-period drill (CD-5B).
        buckets: toBuckets(prevStarts, resolvedGrain),
      };
    }

    return {
      kind: "time_series",
      measure: q.measure,
      dimension: "time",
      grain: resolvedGrain,
      range: rangeIso(fromMs, toMs),
      includeTests: q.filters.includeTests,
      buckets: toBuckets(starts, resolvedGrain),
      series,
      compareSeries,
      warnings: [],
      truncated: false,
    };
  }

  // ── Categorical ───────────────────────────────────────────────────────────
  const limit = q.limit ?? 25;
  const rows = await analyticsQueriesRepo.aggregateRuns(
    aggregateParams(ctx, { fromMs, toMs }, { limit: limit + 1 }),
  );
  const truncated = rows.length > limit;
  const kept = rows.slice(0, limit).filter((r) => r.groupKey !== null);

  if (q.dimension === "workflow") {
    const missing = kept
      .map((r) => r.groupKey as string)
      .filter((id) => !workflowRefs.has(id));
    if (missing.length > 0) {
      const refs = await workflowsRepo.listByIdsForAccount(accountId, missing);
      for (const ref of refs) workflowRefs.set(ref.id, ref);
    }
  }

  const dimension = q.dimension;
  let resultRows = kept.map((r) => {
    const key = r.groupKey as string;
    const { label, workflowState } = categoricalLabel(dimension, key, workflowRefs);
    return {
      id: key,
      label,
      workflowState,
      value: deriveMeasureValue(q.measure, baseOf(r)),
      runs: r.runs,
    };
  });

  const sort = q.sort ?? { by: "value" as const, dir: "desc" as const };
  resultRows = [...resultRows].sort((a, b) => {
    let cmp: number;
    if (sort.by === "label") {
      cmp = a.label.localeCompare(b.label);
    } else {
      // null values sort last regardless of direction.
      if (a.value === null && b.value === null) cmp = 0;
      else if (a.value === null) return 1;
      else if (b.value === null) return -1;
      else cmp = a.value - b.value;
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return {
    kind: "categorical",
    measure: q.measure,
    dimension,
    grain: null,
    range: rangeIso(fromMs, toMs),
    includeTests: q.filters.includeTests,
    rows: resultRows,
    warnings: truncated
      ? [`Showing the ${limit} most active ${dimensionNoun(dimension)}.`]
      : [],
    truncated,
  };
}

function rangeIso(fromMs: number, toMs: number): { from: string; to: string } {
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

function dimensionNoun(d: "workflow" | "status" | "trigger_source"): string {
  if (d === "workflow") return "workflows";
  if (d === "status") return "statuses";
  return "trigger sources";
}
