import {
  AnalyticsQuerySchema,
  type AnalyticsQuery,
  type AnalyticsQueryResult,
} from "@/contracts/analyticsQuery";
import type {
  AnalyticsSourceCatalog,
  AnalyticsValueUnit,
} from "@/contracts/analyticsCatalog";
import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import { AnalyticsQueryError, runAnalyticsQuery } from "../insightQuery";
import type { AnalyticsDatasetAdapter, AnalyticsExecutionContext } from "./registry";

/**
 * ChainReact internal source — `chainreact.workflow_runs` (CD-1).
 *
 * The CS-1 engine exposed as the first catalog dataset. The adapter is a THIN
 * TRANSLATION: connected query → CS-1 `AnalyticsQuery` → the untouched
 * `runAnalyticsQuery` (same RPC, same metric definitions, same membership
 * validation and non-leaking unknown-workflow behavior) → connected result.
 * No SQL is duplicated; no authorization is re-implemented; internal datasets
 * never touch provider-credential resolution.
 *
 * DRIFT GUARD: this catalog is parity-pinned to CS-1's
 * `ANALYTICS_MEASURE_CAPABILITIES` by
 * tests/unit/services/analytics/insights/chainreactCatalogParity — a
 * capability change on either side fails the pin.
 */

export const chainreactCatalog: AnalyticsSourceCatalog = {
  source: {
    id: "chainreact",
    providerId: null,
    label: "ChainReact",
    description: "Your workflows and their runs.",
    credentialMode: "internal",
    connectionRequired: false,
  },
  datasets: [
    {
      id: "workflow_runs",
      label: "Workflow runs",
      description: "Every completed run of your workflows.",
      recordNoun: "runs",
      // Runs are exposed through NAMED measures (the CS-1 canon), so the
      // mechanical count is suppressed in favor of the named `runs`.
      deriveCount: false,
      fields: [
        {
          id: "workflow",
          label: "Workflow",
          kind: "entity",
          dimensionable: true,
          cardinality: "bounded",
          filterable: true,
          // No registered options resolver exists for internal workflows —
          // CD-3 uses the account workflow listing (an existing safe path),
          // never a client-invented list.
          optionsSource: null,
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "status",
          label: "Status",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "trigger_source",
          label: "Trigger source",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "include_tests",
          label: "Include test runs",
          kind: "boolean",
          dimensionable: false,
          filterable: true,
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
      ],
      dateFields: [{ id: "started", label: "Run start", historical: true }],
      namedMeasures: [
        {
          id: "runs",
          label: "Runs",
          unit: "count",
          emptyValue: "zero",
          compare: true,
        },
        {
          id: "succeeded_runs",
          label: "Successful runs",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "workflow", "trigger_source"],
          incompatibleFilters: ["status"],
          compare: true,
        },
        {
          id: "failed_runs",
          label: "Failed runs",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "workflow", "trigger_source"],
          incompatibleFilters: ["status"],
          compare: true,
        },
        {
          id: "success_rate",
          label: "Success rate",
          unit: "percent",
          emptyValue: "null",
          dimensions: ["time", "workflow", "trigger_source"],
          incompatibleFilters: ["status"],
          compare: true,
        },
        {
          id: "avg_duration_ms",
          label: "Average duration",
          unit: "milliseconds",
          emptyValue: "null",
          compare: true,
        },
      ],
      supportedCharts: ["kpi", "line", "bar", "table"],
      partToWholeDimensions: [],
      series: [
        { by: "workflow", max: 8, modes: ["explicit", "top"] },
        { by: "status", max: 2, modes: [] },
      ],
      compare: true,
      queryLimits: { maxRangeDays: 366, maxBuckets: 400, maxCategoryRows: 50 },
      freshness: { mode: "live", ttlSeconds: 0 },
      executionMode: "local_sql",
      previewSafe: true,
      drilldown: false,
    },
  ],
};

const MEASURE_UNIT: Record<string, AnalyticsValueUnit> = {
  runs: "count",
  succeeded_runs: "count",
  failed_runs: "count",
  success_rate: "percent",
  avg_duration_ms: "milliseconds",
};

function toCsQuery(q: ConnectedAnalyticsQuery): AnalyticsQuery {
  const filters = q.filters ?? {};
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) && v.length ? (v as string[]) : undefined;
  const raw = {
    measure: q.measure,
    dimension: q.dimension,
    ...(q.timeGrain !== undefined ? { timeGrain: q.timeGrain } : {}),
    ...(q.series
      ? {
          series:
            q.series.by === "status"
              ? { by: "status" }
              : {
                  by: "workflow",
                  mode: q.series.mode,
                  ...(q.series.ids ? { ids: q.series.ids } : {}),
                  ...(q.series.topN !== undefined ? { topN: q.series.topN } : {}),
                },
        }
      : {}),
    filters: {
      ...(arr(filters["workflow"]) ? { workflowIds: arr(filters["workflow"]) } : {}),
      ...(arr(filters["status"]) ? { statuses: arr(filters["status"]) } : {}),
      ...(arr(filters["trigger_source"])
        ? { triggerSources: arr(filters["trigger_source"]) }
        : {}),
      includeTests: filters["include_tests"] === true,
    },
    range: q.range,
    ...(q.compare !== undefined ? { compare: q.compare } : {}),
    ...(q.sort !== undefined ? { sort: q.sort } : {}),
    ...(q.limit !== undefined ? { limit: q.limit } : {}),
  };
  // Schema-parse so CS-1 defaults apply and anything untranslatable 400s
  // as INVALID_QUERY rather than reaching the engine malformed.
  const parsed = AnalyticsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConnectedAnalyticsError(
      parsed.error.issues[0]?.message ?? "Invalid query.",
      "INVALID_QUERY",
    );
  }
  return parsed.data;
}

function toConnectedResult(
  q: ConnectedAnalyticsQuery,
  r: AnalyticsQueryResult,
): ConnectedAnalyticsResult {
  const measureLabel =
    chainreactCatalog.datasets[0]!.namedMeasures.find((m) => m.id === q.measure)?.label ??
    q.measure;
  return {
    kind: r.kind,
    source: {
      sourceId: "chainreact",
      sourceLabel: "ChainReact",
      datasetId: "workflow_runs",
      datasetLabel: "Workflow runs",
    },
    measure: { id: q.measure, label: measureLabel },
    dimension: r.dimension,
    grain: r.grain,
    range: r.range,
    valueMeta: { unit: MEASURE_UNIT[q.measure] ?? "decimal" },
    freshness: { mode: "live" },
    completeness: r.truncated
      ? { state: "row_capped", detail: "Showing the most active groups." }
      : { state: "complete" },
    ...(r.value !== undefined ? { value: r.value } : {}),
    ...(r.compare !== undefined ? { compare: r.compare } : {}),
    ...(r.buckets !== undefined ? { buckets: r.buckets } : {}),
    ...(r.series !== undefined
      ? {
          series: r.series.map((s) => ({
            id: s.meta.id,
            label: s.meta.label,
            entityState: s.meta.workflowState,
            values: s.values,
          })),
        }
      : {}),
    ...(r.compareSeries !== undefined ? { compareSeries: r.compareSeries } : {}),
    ...(r.rows !== undefined
      ? {
          rows: r.rows.map((row) => ({
            id: row.id,
            label: row.label,
            entityState: row.workflowState,
            value: row.value,
            records: row.runs,
          })),
        }
      : {}),
    warnings: r.warnings,
  };
}

export const chainreactWorkflowRunsAdapter: AnalyticsDatasetAdapter = {
  sourceId: "chainreact",
  datasetId: "workflow_runs",
  requiredScopes: [],
  async query(
    ctx: AnalyticsExecutionContext,
    query: ConnectedAnalyticsQuery,
  ): Promise<ConnectedAnalyticsResult> {
    try {
      const result = await runAnalyticsQuery(ctx.accountId, toCsQuery(query), {
        ...(ctx.now !== undefined ? { now: ctx.now } : {}),
      });
      return toConnectedResult(query, result);
    } catch (err) {
      if (err instanceof AnalyticsQueryError) {
        throw new ConnectedAnalyticsError(
          err.message,
          err.code === "UNKNOWN_WORKFLOW" ? "UNKNOWN_ENTITY" : "INVALID_QUERY",
        );
      }
      throw err;
    }
  },
};
