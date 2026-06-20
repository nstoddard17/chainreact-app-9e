import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { pagesList } from "@/integrations/_shared/facebook/api/pagesList";
import { getPageAccessToken } from "@/integrations/_shared/facebook/api/getPageAccessToken";
import {
  FacebookPermissionError,
  NotFoundError,
  RateLimitError,
} from "@/integrations/_shared/facebook/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { getPageAudienceCounts, scanPagePosts } from "./api";
import { bucketIndexForMs, parsePageId, planBuckets } from "./buckets";

/**
 * Facebook connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-FACEBOOK-1).
 *
 * READ-ONLY + COUNT-ONLY + AGGREGATE/METADATA-ONLY Page analytics. Reduces bounded
 * Facebook Graph reads (managed-page list, page audience counts, page-post metadata) to
 * numeric aggregates: managed-page count, page fan / followers counts, and page-post
 * count / posts-over-time. Never executes a workflow node, never takes a raw Graph query
 * from widget config (the page is a validated numeric id; `fields`/`limit` are
 * server-side constants), and never reads a post message, comment, reaction, attachment,
 * media URL, commenter/user identity, profile, or inbox. Approved metrics only.
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Facebook is PERSONAL and NON-REFRESHABLE (long-lived user token; a hard 401 surfaces
 * as reconnect-required). This resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins refresh/retry to that row — never a
 * co-member's. Page access tokens are derived at runtime from the user token via
 * `getPageAccessToken` and are NEVER returned, cached, or logged. The cache layer keys
 * personal providers with `source_user_id = ctx.userId`, so each member's snapshot is
 * distinct. No connection → MISSING_CREDENTIAL.
 *
 * PRIVACY: only COUNTS + aggregate audience numbers + post created_time buckets are
 * computed and cached. No post content, comments, reactions, user identities, page
 * tokens, or raw Graph payloads are returned or stored.
 *
 * SCOPES: uses the already-granted `pages_show_list` (managed pages + page-token
 * derivation) + `pages_read_engagement` (page node fields + posts). No new scope.
 *
 * NOTE: Page Insights (impressions / reach / engagement) are intentionally DEFERRED from
 * v1. They are aggregate-safe (no user data), but the Graph `page_*` insight metric names
 * deprecate / change across API versions and can't be validated here; shipping them is a
 * follow-up once a metric set is confirmed stable against the pinned Graph version.
 */

const PROVIDER_KEY = "facebook";
const PAGE_FILTER = ["facebook_page"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "pages_count",
    label: "Managed Pages",
    description: "Facebook Pages you manage.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "page_fan_count",
    label: "Page likes",
    description: "Total likes of the selected Page.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PAGE_FILTER,
  },
  {
    key: "page_followers_count",
    label: "Page followers",
    description: "Total followers of the selected Page.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PAGE_FILTER,
  },
  {
    key: "page_posts_count",
    label: "Posts",
    description: "Posts published by the selected Page.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: PAGE_FILTER,
  },
  {
    key: "page_posts_over_time",
    label: "Posts over time",
    description: "Posts published per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: PAGE_FILTER,
  },
];

const PAGE_SCOPED_METRICS: ReadonlySet<string> = new Set([
  "page_fan_count",
  "page_followers_count",
  "page_posts_count",
  "page_posts_over_time",
]);

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Facebook read into a typed, leak-free AnalyticsSourceError. */
function classifyFacebookError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Facebook before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof FacebookPermissionError) {
    return new AnalyticsSourceError(
      "Reconnect Facebook with the required Page permissions granted.",
      "MISSING_CREDENTIAL",
    );
  }
  if (err instanceof RateLimitError) {
    return new AnalyticsSourceError("Facebook's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError("ChainReact can't read that Facebook Page. Re-pick a Page.", "INVALID_QUERY");
  }
  // FacebookApiError + anything else — no raw tag / token / payload leak.
  return new AnalyticsSourceError("Couldn't load Facebook data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Facebook connection (or MISSING_CREDENTIAL). */
async function resolveOwnFacebook(ctx: AnalyticsSourceContext): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Facebook to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? ["Based on part of this Page's posts — it has more than a single widget scans."]
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
  rows: ReadonlyArray<{ date: string; count: number }>,
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: rows.map((r) => ({ date: r.date, count: r.count })),
    totals: { count: rows.reduce((a, r) => a + r.count, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

export const facebookAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Facebook",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Facebook metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the required page id server-side BEFORE any I/O (page-scoped metrics only).
    let pageId: string | null = null;
    if (PAGE_SCOPED_METRICS.has(query.metricKey)) {
      try {
        pageId = parsePageId(query.filters?.facebook_page);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Pick a Facebook Page.",
          "INVALID_QUERY",
        );
      }
    }

    const generatedAt = new Date().toISOString();
    const { providerAccountId } = await resolveOwnFacebook(ctx);

    const run = <T>(apiCall: (userToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Account-wide: managed page count (user token) ─────────────────────
      if (query.metricKey === "pages_count") {
        const list = await run((userToken) => pagesList({ accessToken: userToken }));
        const count = Array.isArray(list.data) ? list.data.length : 0;
        return scalarResult("pages_count", count, generatedAt, [], false);
      }

      // ── Page audience scalars (derive page token, then read aggregate fields)
      if (query.metricKey === "page_fan_count" || query.metricKey === "page_followers_count") {
        const counts = await run(async (userToken) => {
          const pageAccessToken = await getPageAccessToken({ accessToken: userToken, pageId: pageId! });
          return getPageAudienceCounts({ pageAccessToken, pageId: pageId! });
        });
        const value =
          query.metricKey === "page_fan_count" ? (counts.fanCount ?? 0) : (counts.followersCount ?? 0);
        return scalarResult(query.metricKey, value, generatedAt, [], false);
      }

      // ── Page-post metrics (shared bounded post scan) ──────────────────────
      const scan = await run(async (userToken) => {
        const pageAccessToken = await getPageAccessToken({ accessToken: userToken, pageId: pageId! });
        return scanPagePosts(pageAccessToken, pageId!);
      });

      if (query.metricKey === "page_posts_count") {
        return scalarResult(
          "page_posts_count",
          scan.timestamps.length,
          generatedAt,
          truncationWarning(scan.truncated),
          scan.truncated,
        );
      }

      // page_posts_over_time
      const buckets = planBuckets(query.range.since, query.range.until);
      if (buckets.length === 0) {
        return seriesResult([], generatedAt, ["The selected date range is empty or invalid."], scan.truncated);
      }
      const counts = new Array<number>(buckets.length).fill(0);
      for (const ts of scan.timestamps) {
        const idx = bucketIndexForMs(buckets, ts);
        if (idx >= 0) counts[idx]! += 1;
      }
      const rows = buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 }));
      return seriesResult(rows, generatedAt, truncationWarning(scan.truncated), scan.truncated);
    } catch (err) {
      throw classifyFacebookError(err);
    }
  },
};
