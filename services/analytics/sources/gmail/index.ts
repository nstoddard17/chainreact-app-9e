import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { SCALAR_MAX_PAGES, SERIES_BUCKET_MAX_PAGES, PAGE_SIZE, countMessages } from "./api";
import {
  RECEIVED_BASE_QUERY,
  SENT_BASE_QUERY,
  UNREAD_QUERY,
  dateRangeQuery,
  parseLabelId,
  planBuckets,
  type GmailTimeBucket,
} from "./buckets";

/**
 * Gmail connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-GMAIL-1).
 *
 * READ-ONLY. Reduces bounded `users.messages.list` COUNT queries to numeric
 * aggregates. Never executes a workflow node, never takes a raw Gmail query from
 * widget config (queries are built server-side from approved constants + a
 * validated date window / label id), never fetches a message body. Approved
 * metrics only (validated against the registry upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Gmail is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins the refresh/retry to that row's
 * `providerAccountId` — never a co-member's. The cache layer keys personal
 * providers with `source_user_id = ctx.userId`, so each member's snapshot is
 * distinct. No Gmail connection → typed MISSING_CREDENTIAL. Gmail is REFRESHABLE →
 * the read runs through `refreshAndRetry`.
 *
 * PRIVACY: only message COUNTS are computed and cached. No bodies, snippets,
 * subjects, sender/recipient addresses, message ids, or raw payloads are read,
 * returned, or stored.
 *
 * SCOPES: `messages.list` is fully authorized by `gmail.modify` — the only
 * scope the Gmail manifest requests (GOOGLE-OAUTH-SCOPE-MINIMIZATION-1).
 * No new scope is requested. (An earlier revision of this comment named
 * `gmail.readonly`, which ChainReact does not request.)
 */

const PROVIDER_KEY = "gmail";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "unread_count",
    label: "Unread emails",
    description: "Current unread emails in your inbox.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "label_message_count",
    label: "Emails in label",
    description: "Emails carrying the selected label over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: ["label"],
  },
  {
    key: "emails_received_over_time",
    label: "Emails received over time",
    description: "Emails received per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "emails_sent_over_time",
    label: "Emails sent over time",
    description: "Emails sent per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Gmail read into a typed, leak-free AnalyticsSourceError. */
function classifyGmailError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Reconnect Gmail before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit|quota|rateLimitExceeded|userRateLimitExceeded|HTTP 429/i.test(message)) {
    return new AnalyticsSourceError("Google's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  return new AnalyticsSourceError("Couldn't load Gmail data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Gmail connection (or MISSING_CREDENTIAL). */
async function resolveOwnGmail(
  ctx: AnalyticsSourceContext,
): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Gmail to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarnings(truncated: boolean): string[] {
  return truncated
    ? [`Counts are capped at ${SCALAR_MAX_PAGES * PAGE_SIZE} — there were more emails than that.`]
    : [];
}

function scalarResult(
  metricKey: string,
  value: number,
  generatedAt: string,
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
    warnings: truncationWarnings(truncated),
    truncated,
  };
}

function seriesResult(
  buckets: readonly GmailTimeBucket[],
  counts: readonly number[],
  generatedAt: string,
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
    warnings: truncated
      ? ["Some buckets were capped — there were more emails than the per-bucket limit."]
      : [],
    truncated,
  };
}

export const gmailAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Gmail",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Gmail metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the label filter (label_message_count only) BEFORE any I/O.
    let labelId: string | null = null;
    if (query.metricKey === "label_message_count") {
      try {
        labelId = parseLabelId(query.filters?.label);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Pick a Gmail label.",
          "INVALID_QUERY",
        );
      }
    }

    const generatedAt = new Date().toISOString();
    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);

    const { providerAccountId } = await resolveOwnGmail(ctx);
    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Scalars ──────────────────────────────────────────────────────────────
      if (query.metricKey === "unread_count") {
        const { count, truncated } = await run((t) =>
          countMessages(t, { q: UNREAD_QUERY, maxPages: SCALAR_MAX_PAGES }),
        );
        return scalarResult("unread_count", count, generatedAt, truncated);
      }

      if (query.metricKey === "label_message_count") {
        const dateQ = !Number.isNaN(sinceMs) && !Number.isNaN(untilMs) && untilMs > sinceMs
          ? dateRangeQuery(sinceMs, untilMs)
          : undefined;
        const { count, truncated } = await run((t) =>
          countMessages(t, {
            labelIds: [labelId as string],
            ...(dateQ ? { q: dateQ } : {}),
            maxPages: SCALAR_MAX_PAGES,
          }),
        );
        return scalarResult("label_message_count", count, generatedAt, truncated);
      }

      // ── Series (one bounded count per bucket) ─────────────────────────────────
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

      const base = query.metricKey === "emails_sent_over_time" ? SENT_BASE_QUERY : RECEIVED_BASE_QUERY;
      const { values, truncated } = await run(async (t) => {
        const vals: number[] = [];
        let trunc = false;
        for (const bucket of buckets) {
          const q = `${base} ${dateRangeQuery(bucket.startMs, bucket.endMs)}`;
          const res = await countMessages(t, { q, maxPages: SERIES_BUCKET_MAX_PAGES });
          vals.push(res.count);
          if (res.truncated) trunc = true;
        }
        return { values: vals, truncated: trunc };
      });

      return seriesResult(buckets, values, generatedAt, truncated);
    } catch (err) {
      throw classifyGmailError(err);
    }
  },
};
