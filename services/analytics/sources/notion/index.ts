import { getActiveForExecution } from "@/repositories/integrations";
import { decryptToken } from "@/core/encryption/tokens";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/notion/api/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { MAX_PAGES, PAGE_SIZE, scanPages, type PageFact } from "./api";
import { bucketIndexForMs, inRange, planBuckets, type NotionTimeBucket } from "./buckets";

/**
 * Notion connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-NOTION-1).
 *
 * READ-ONLY. Reduces a BOUNDED `/v1/search` scan of accessible page objects to
 * numeric workspace-activity aggregates (counts + over-time series). Never executes
 * a workflow node, never takes a raw Notion search query from widget config (the
 * query is always empty + a fixed object-type filter), never reads page title,
 * properties, block content, parent, or url. Approved metrics only (validated
 * upstream).
 *
 * CREDENTIAL MODEL (account provider, per core/integrations/credentialSharing.ts):
 * Notion is an ACCOUNT-shared workspace grant, so this resolves the ACCOUNT'S Notion
 * connection (no per-user pin) — every account member sees the same workspace
 * aggregates. The cache layer keys account-shared providers with
 * `source_user_id = null`. Notion is NON-REFRESHABLE → an auth failure maps to
 * MISSING_CREDENTIAL (reconnect), never a refresh attempt.
 *
 * PRIVACY: only page COUNTS + created/edited timing are computed and cached. No
 * page content, block content, titles, properties, user names, comments, rich
 * text, ids, or raw Notion payloads are returned or stored.
 *
 * SCOPES: uses the already-granted `read_content` capability (the search endpoint).
 * No new scope is requested.
 */

const PROVIDER_KEY = "notion";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "total_pages_count",
    label: "Total pages",
    description: "Active pages ChainReact can see in this workspace.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "recently_updated_count",
    label: "Recently updated pages",
    description: "Pages edited within the selected range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "pages_created_over_time",
    label: "Pages created over time",
    description: "Pages created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "pages_edited_over_time",
    label: "Pages edited over time",
    description: "Pages edited per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Notion read into a typed, leak-free AnalyticsSourceError. */
function classifyNotionError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  // 401 (token rejected) or 404 on the search endpoint (integration revoked) →
  // reconnect. Notion is non-refreshable, so there is no refresh attempt.
  if (err instanceof Unauthorized401Error || err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "Reconnect Notion before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Notion's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Notion error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Notion data.", "PROVIDER_ERROR");
}

/** Resolve the ACCOUNT'S Notion token (account-shared), or MISSING_CREDENTIAL. */
async function resolveAccountNotionToken(ctx: AnalyticsSourceContext): Promise<string> {
  // No connectedByUserId pin — Notion is account-shared (a workspace grant).
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null);
  if (!integration) {
    throw new AnalyticsSourceError("Connect Notion to use this widget.", "MISSING_CREDENTIAL");
  }
  try {
    return decryptToken(integration.accessTokenEncrypted);
  } catch {
    throw new AnalyticsSourceError(
      "Reconnect Notion before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Based on the most recent ${MAX_PAGES * PAGE_SIZE} pages — this workspace has more than that.`]
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
  buckets: readonly NotionTimeBucket[],
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

export const notionAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Notion",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Notion metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    const generatedAt = new Date().toISOString();
    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);

    const token = await resolveAccountNotionToken(ctx);

    let scan;
    try {
      scan = await scanPages(token, {});
    } catch (err) {
      throw classifyNotionError(err);
    }

    const truncated = scan.truncated;
    const active: readonly PageFact[] = scan.facts.filter((f) => !f.archived);

    // ── Scalars ──────────────────────────────────────────────────────────────
    if (query.metricKey === "total_pages_count") {
      return scalarResult("total_pages_count", active.length, generatedAt, truncationWarnings(truncated), truncated);
    }
    if (query.metricKey === "recently_updated_count") {
      const validRange = !Number.isNaN(sinceMs) && !Number.isNaN(untilMs) && untilMs > sinceMs;
      const count = validRange ? active.filter((f) => inRange(f.lastEditedMs, sinceMs, untilMs)).length : 0;
      return scalarResult("recently_updated_count", count, generatedAt, truncationWarnings(truncated), truncated);
    }

    // ── Series ────────────────────────────────────────────────────────────────
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
        truncated,
      };
    }

    const useCreated = query.metricKey === "pages_created_over_time";
    const counts = new Array<number>(buckets.length).fill(0);
    for (const f of active) {
      const idx = bucketIndexForMs(buckets, useCreated ? f.createdMs : f.lastEditedMs);
      if (idx >= 0) counts[idx]! += 1;
    }
    return seriesResult(buckets, counts, generatedAt, truncationWarnings(truncated), truncated);
  },
};
