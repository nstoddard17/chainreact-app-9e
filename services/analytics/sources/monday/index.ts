import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError, RateLimitError } from "@/integrations/_shared/monday/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { MAX_PAGES, PAGE_SIZE, fetchGroups, fetchItemCount, scanItems, type ItemFact } from "./api";
import { bucketIndexForMs, parseBoardId, planBuckets, type MondayTimeBucket } from "./buckets";

/**
 * Monday connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-MONDAY-1).
 *
 * READ-ONLY. Reduces a BOUNDED read of one board's items to numeric work-management
 * aggregates (open count + created-over-time + per-group breakdown). Never executes
 * a workflow node, never takes a raw Monday GraphQL document from widget config (the
 * board is a validated numeric id; queries are fixed server-side constants), never
 * reads an item name, column value, update, file, or assignee. Approved metrics only
 * (validated upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Monday is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins the refresh/retry to that row's
 * `providerAccountId` — never a co-member's. The cache layer keys personal providers
 * with `source_user_id = ctx.userId`, so each member's snapshot is distinct. No
 * Monday connection → typed MISSING_CREDENTIAL. Monday is REFRESHABLE → the read runs
 * through `refreshAndRetry`.
 *
 * PRIVACY: only item COUNTS / created TIMING / per-group counts are computed and
 * cached. No item names, column values, updates, files, assignee names, item ids, or
 * raw Monday payloads are returned or stored. (Group TITLES are board-structure
 * labels — like Trello lists — and are the only text surfaced, on items_by_group.)
 *
 * SCOPES: uses only the already-granted `boards:read` scope (board items_count +
 * items_page + groups). No new scope is requested.
 */

const PROVIDER_KEY = "monday";
const STATE_ACTIVE = "active";

const BOARD_FILTER = ["monday_board"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "open_items_count",
    label: "Open items",
    description: "Active items on the board.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
  {
    key: "items_created_over_time",
    label: "Items created over time",
    description: "Items created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
  {
    key: "items_by_group",
    label: "Items by group",
    description: "Active items grouped by board group.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: BOARD_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Monday read into a typed, leak-free AnalyticsSourceError. */
function classifyMondayError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Monday before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof RateLimitError) {
    return new AnalyticsSourceError("Monday's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't read that Monday board. Check the board or your access.",
      "INVALID_QUERY",
    );
  }
  // No raw Monday error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Monday data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Monday connection (or MISSING_CREDENTIAL). */
async function resolveOwnMonday(
  ctx: AnalyticsSourceContext,
): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Monday to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Based on the first ${MAX_PAGES * PAGE_SIZE} items — this board has more than that.`]
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

export const mondayAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Monday",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Monday metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the board filter server-side BEFORE any I/O (required).
    let boardId: string;
    try {
      boardId = parseBoardId(query.filters?.monday_board);
    } catch (err) {
      throw new AnalyticsSourceError(
        err instanceof Error ? err.message : "Pick a Monday board.",
        "INVALID_QUERY",
      );
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnMonday(ctx);
    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Scalar: open (active) item count — server-side count, no item data ───
      if (query.metricKey === "open_items_count") {
        const count = await run((t) => fetchItemCount(t, boardId));
        return scalarResult("open_items_count", count, generatedAt, [], false);
      }

      // ── Breakdown: active items by group (group-title labels) ────────────────
      if (query.metricKey === "items_by_group") {
        const [{ facts, truncated }, groups] = await run(async (t) =>
          Promise.all([scanItems(t, boardId), fetchGroups(t, boardId)]),
        );
        const active = facts.filter((f) => f.state === STATE_ACTIVE);
        const countByGroup = new Map<string, number>();
        for (const f of active) {
          if (f.groupId === null) continue;
          countByGroup.set(f.groupId, (countByGroup.get(f.groupId) ?? 0) + 1);
        }
        const rows = groups.map((g) => ({
          date: typeof g.title === "string" && g.title.length > 0 ? g.title : g.id,
          count: countByGroup.get(g.id) ?? 0,
        }));
        return {
          shape: "series",
          dimensions: ["group"],
          measures: ["count"],
          rows,
          totals: { count: rows.reduce((a, r) => a + (typeof r.count === "number" ? r.count : 0), 0) },
          generatedAt,
          freshness: liveFreshness(),
          warnings: truncationWarnings(truncated),
          truncated,
        };
      }

      // ── Series: items created over time (active items, by created_at) ────────
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
      const { facts, truncated } = await run((t) => scanItems(t, boardId));
      const active: readonly ItemFact[] = facts.filter((f) => f.state === STATE_ACTIVE);
      const counts = new Array<number>(buckets.length).fill(0);
      for (const f of active) {
        const idx = bucketIndexForMs(buckets, f.createdMs);
        if (idx >= 0) counts[idx]! += 1;
      }
      return seriesResult(buckets, counts, generatedAt, truncationWarnings(truncated), truncated);
    } catch (err) {
      throw classifyMondayError(err);
    }
  },
};

function seriesResult(
  buckets: readonly MondayTimeBucket[],
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
