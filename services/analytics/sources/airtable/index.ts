import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/airtable/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { MAX_PAGES, PAGE_SIZE, fetchTableCount, scanRecords } from "./api";
import { bucketIndexForMs, parseBaseId, parseTableId, planBuckets, type AirtableTimeBucket } from "./buckets";

/**
 * Airtable connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-AIRTABLE-1).
 *
 * READ-ONLY. Reduces a BOUNDED read of one base/table to numeric aggregates
 * (record counts + created-over-time) plus a base-level table count. Never executes
 * a workflow node, never takes a raw Airtable query (`filterByFormula` / sort /
 * view) from widget config (base + table are validated ids from the pickers), never
 * reads a cell value / field / attachment / comment / collaborator. Approved
 * metrics only (validated upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Airtable is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins the refresh/retry to that row's
 * `providerAccountId` — never a co-member's. The cache layer keys personal
 * providers with `source_user_id = ctx.userId`, so each member's snapshot is
 * distinct. No Airtable connection → typed MISSING_CREDENTIAL. Airtable is
 * REFRESHABLE → the read runs through `refreshAndRetry`.
 *
 * PRIVACY: only record COUNTS / created TIMING / a base's table COUNT are computed
 * and cached. No record fields, cell values, attachment urls, comments,
 * collaborator names, table names, record ids, or raw Airtable payloads are
 * returned or stored.
 *
 * SCOPES: uses only the already-granted `data.records:read` (records) +
 * `schema.bases:read` (table count) scopes. No new scope is requested.
 */

const PROVIDER_KEY = "airtable";

const BASE_AND_TABLE = ["airtable_base", "airtable_table"] as const;
const BASE_ONLY = ["airtable_base"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "record_count",
    label: "Record count",
    description: "Records in the selected table.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: BASE_AND_TABLE,
  },
  {
    key: "records_created_over_time",
    label: "Records created over time",
    description: "Records created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: BASE_AND_TABLE,
  },
  {
    key: "tables_count",
    label: "Tables in base",
    description: "Tables in the selected base.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: BASE_ONLY,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from an Airtable read into a typed, leak-free AnalyticsSourceError. */
function classifyAirtableError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Reconnect Airtable before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't read that Airtable base or table. Check it or your access.",
      "INVALID_QUERY",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Airtable's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Airtable error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Airtable data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Airtable connection (or MISSING_CREDENTIAL). */
async function resolveOwnAirtable(
  ctx: AnalyticsSourceContext,
): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Airtable to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Based on the first ${MAX_PAGES * PAGE_SIZE} records — this table has more than that.`]
    : [];
}

function scalarResult(
  metricKey: string,
  value: number,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: [metricKey],
    rows: [{ [metricKey]: value }],
    totals: { [metricKey]: value },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

function seriesResult(
  buckets: readonly AirtableTimeBucket[],
  counts: readonly number[],
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 })),
    totals: { count: counts.reduce((a, b) => a + b, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const airtableAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Airtable",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Airtable metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate base (always) + table (record metrics) server-side BEFORE any I/O.
    const needsTable = metric.supportedFilters.includes("airtable_table");
    let baseId: string;
    let tableId = "";
    try {
      baseId = parseBaseId(query.filters?.airtable_base);
      if (needsTable) tableId = parseTableId(query.filters?.airtable_table);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick an Airtable base and table.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnAirtable(ctx);
    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Scalar: tables in base (base only) ──────────────────────────────────
      if (query.metricKey === "tables_count") {
        const count = await run((t) => fetchTableCount(t, baseId));
        return scalarResult("tables_count", count, generatedAt, [], false);
      }

      // ── Scalar: record count ────────────────────────────────────────────────
      if (query.metricKey === "record_count") {
        const { facts, truncated } = await run((t) => scanRecords(t, baseId, tableId));
        return scalarResult("record_count", facts.length, generatedAt, truncationWarnings(truncated), truncated);
      }

      // ── Series: records created over time ─────────────────────────────────────
      const buckets = planBuckets(query.range.since, query.range.until);
      if (buckets.length === 0) {
        return {
          shape: "series",
          dimensions: ["date"],
          measures: ["count"],
          rows: [],
          totals: { count: 0 },
          generatedAt,
          freshness: liveFreshness(),
          warnings: ["The selected date range is empty or invalid."],
          truncated: false,
        };
      }
      const { facts, truncated } = await run((t) => scanRecords(t, baseId, tableId));
      const counts = new Array<number>(buckets.length).fill(0);
      for (const f of facts) {
        const idx = bucketIndexForMs(buckets, f.createdMs);
        if (idx >= 0) counts[idx]! += 1;
      }
      return seriesResult(buckets, counts, generatedAt, truncationWarnings(truncated), truncated);
    } catch (err) {
      throw classifyAirtableError(err);
    }
  },
};
