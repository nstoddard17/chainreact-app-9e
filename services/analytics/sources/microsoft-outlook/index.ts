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
  INBOX_FOLDER,
  SENT_FOLDER,
  UNREAD_FILTER,
  parseFolderId,
  planBuckets,
  receivedRangeFilter,
  sentRangeFilter,
  type OutlookTimeBucket,
} from "./buckets";

/**
 * Microsoft Outlook mail connected-app analytics source — v1
 * (Slice ANALYTICS-SOURCES-OUTLOOK-1). The close mirror of the Gmail source.
 *
 * READ-ONLY. Reduces bounded Microsoft Graph `/me/messages` COUNT queries
 * (`$select=id` only) to numeric aggregates. Never executes a workflow node,
 * never takes a raw Graph $filter/$search from widget config (queries are built
 * server-side from APPROVED constants + a validated date window / folder id),
 * never fetches a message body, preview, subject, sender, or recipient. Approved
 * metrics only (validated against the registry upstream).
 *
 * CREDENTIAL MODEL (personal provider, per core/integrations/credentialSharing.ts):
 * Outlook is PERSONAL, so this resolves the REQUESTING USER'S OWN connection
 * (`connected_by_user_id = ctx.userId`) and pins the refresh/retry to that row's
 * `providerAccountId` — never a co-member's. The cache layer keys personal
 * providers with `source_user_id = ctx.userId`, so each member's snapshot is
 * distinct. No Outlook connection → typed MISSING_CREDENTIAL. Outlook is
 * REFRESHABLE → the read runs through `refreshAndRetry`.
 *
 * PRIVACY: only message COUNTS are computed and cached. No bodies, previews,
 * subjects, sender/recipient addresses, message ids, web links, attachments, or
 * raw Graph payloads are read, returned, or stored.
 *
 * SCOPES: uses the already-granted `Mail.Read` scope (messages list + mailFolders).
 * No new scope is requested.
 */

const PROVIDER_KEY = "microsoft-outlook";

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
    key: "folder_message_count",
    label: "Emails in folder",
    description: "Emails received into the selected folder over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: ["folder"],
  },
  {
    key: "emails_received_over_time",
    label: "Emails received over time",
    description: "Emails received into your inbox per time bucket.",
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

/** Map any error from a Graph read into a typed, leak-free AnalyticsSourceError. */
function classifyOutlookError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Reconnect Outlook before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/throttl|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Microsoft's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Graph error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Outlook data.", "PROVIDER_ERROR");
}

/** Resolve the requesting user's OWN Outlook connection (or MISSING_CREDENTIAL). */
async function resolveOwnOutlook(
  ctx: AnalyticsSourceContext,
): Promise<{ providerAccountId: string | null }> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null, {
    connectedByUserId: ctx.userId,
  });
  if (!integration) {
    throw new AnalyticsSourceError("Connect Outlook to use this widget.", "MISSING_CREDENTIAL");
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
  buckets: readonly OutlookTimeBucket[],
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

export const microsoftOutlookAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Microsoft Outlook",
  connectedApp: true,
  // Graph mail is rate-limited per mailbox; a query makes ≤ a few dozen bounded
  // GETs. Cache 10 min so repeated dashboard loads don't re-scan the mailbox.
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Outlook metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    // Validate the folder filter (folder_message_count only) BEFORE any I/O.
    let folderId: string | null = null;
    if (query.metricKey === "folder_message_count") {
      try {
        folderId = parseFolderId(query.filters?.folder);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Pick an Outlook folder.",
          "INVALID_QUERY",
        );
      }
    }

    const generatedAt = new Date().toISOString();
    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);

    const { providerAccountId } = await resolveOwnOutlook(ctx);
    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Scalars ──────────────────────────────────────────────────────────────
      if (query.metricKey === "unread_count") {
        const { count, truncated } = await run((t) =>
          countMessages(t, { folder: INBOX_FOLDER, filter: UNREAD_FILTER, maxPages: SCALAR_MAX_PAGES }),
        );
        return scalarResult("unread_count", count, generatedAt, truncated);
      }

      if (query.metricKey === "folder_message_count") {
        const filter =
          !Number.isNaN(sinceMs) && !Number.isNaN(untilMs) && untilMs > sinceMs
            ? receivedRangeFilter(sinceMs, untilMs)
            : undefined;
        const { count, truncated } = await run((t) =>
          countMessages(t, {
            folder: folderId as string,
            ...(filter ? { filter } : {}),
            maxPages: SCALAR_MAX_PAGES,
          }),
        );
        return scalarResult("folder_message_count", count, generatedAt, truncated);
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

      const isSent = query.metricKey === "emails_sent_over_time";
      const folder = isSent ? SENT_FOLDER : INBOX_FOLDER;
      const { values, truncated } = await run(async (t) => {
        const vals: number[] = [];
        let trunc = false;
        for (const bucket of buckets) {
          const filter = isSent
            ? sentRangeFilter(bucket.startMs, bucket.endMs)
            : receivedRangeFilter(bucket.startMs, bucket.endMs);
          const res = await countMessages(t, { folder, filter, maxPages: SERIES_BUCKET_MAX_PAGES });
          vals.push(res.count);
          if (res.truncated) trunc = true;
        }
        return { values: vals, truncated: trunc };
      });

      return seriesResult(buckets, values, generatedAt, truncated);
    } catch (err) {
      throw classifyOutlookError(err);
    }
  },
};
