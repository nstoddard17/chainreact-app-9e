import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/mailchimp/errors";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type AnalyticsSourceContext,
  type AnalyticsSourceMetric,
  type AnalyticsSourceQuery,
  type NormalizedAnalyticsResult,
} from "../types";
import { fetchAudienceMemberCount, scanSentCampaigns } from "./api";
import { bucketIndexForMs, parseAudienceId, planBuckets, type MailchimpTimeBucket } from "./buckets";

/**
 * Mailchimp connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-MAILCHIMP-1).
 *
 * READ-ONLY + COUNT-ONLY. Reduces aggregate Mailchimp reads to numeric marketing
 * aggregates: an audience's current member count + sent-campaign count / over-time.
 * Never executes a workflow node, never takes a raw Mailchimp query from widget config
 * (the audience is a validated id from the picker; the date window is server-built;
 * field projections fetch only counts), and never reads a subscriber email/name/id,
 * merge field, segment, campaign subject/title, or content. Approved metrics only.
 *
 * CREDENTIAL MODEL (account provider, per core/integrations/credentialSharing.ts):
 * Mailchimp is an ACCOUNT-shared marketing account, so this resolves the ACCOUNT'S
 * connection (no per-user pin) — every account member sees the same account/audience
 * aggregates (like Stripe / HubSpot). The cache layer keys account-shared providers
 * with `source_user_id = null`. Mailchimp is NON-REFRESHABLE; the read runs through
 * `refreshAndRetry`, which on a 401 raises `IntegrationActionRequiredError`
 * (refresh unsupported) → mapped to MISSING_CREDENTIAL (reconnect).
 *
 * The Mailchimp datacenter (`dc`) is read from `integration.accountMetadata.dc`
 * (captured at OAuth callback) and threaded into every request; a missing dc maps to
 * MISSING_CREDENTIAL (reconnect) rather than a raw error.
 *
 * PRIVACY: only COUNTS are computed and cached. No subscriber emails, names, ids,
 * merge fields, segments, campaign subjects/titles, content, or raw payloads are
 * returned or stored. (AUDIENCE NAMES are account-level structure labels surfaced
 * only via the picker, not by this adapter.)
 *
 * SCOPES: Mailchimp OAuth grants full-account API access (no granular scopes). No new
 * scope is requested.
 */

const PROVIDER_KEY = "mailchimp";
const AUDIENCE_FILTER = ["mailchimp_audience"] as const;

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "audience_member_count",
    label: "Audience members",
    description: "Current member count of the selected audience.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: AUDIENCE_FILTER,
  },
  {
    key: "campaign_count",
    label: "Campaigns sent",
    description: "Count of campaigns sent over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "campaigns_sent_over_time",
    label: "Campaigns sent over time",
    description: "Campaigns sent per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Mailchimp read into a typed, leak-free AnalyticsSourceError. */
function classifyMailchimpError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Mailchimp before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof NotFoundError) {
    return new AnalyticsSourceError(
      "ChainReact can't find that Mailchimp audience. Re-pick an audience.",
      "INVALID_QUERY",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Mailchimp's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Mailchimp error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Mailchimp data.", "PROVIDER_ERROR");
}

/** Resolve the ACCOUNT'S Mailchimp connection + datacenter, or MISSING_CREDENTIAL. */
async function resolveAccountMailchimp(
  ctx: AnalyticsSourceContext,
): Promise<{ dc: string; providerAccountId: string }> {
  // No connectedByUserId pin — Mailchimp is account-shared.
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null);
  if (!integration) {
    throw new AnalyticsSourceError("Connect Mailchimp to use this widget.", "MISSING_CREDENTIAL");
  }
  const dc = integration.accountMetadata.dc;
  if (typeof dc !== "string" || dc.length === 0) {
    throw new AnalyticsSourceError("Reconnect Mailchimp — missing datacenter info.", "MISSING_CREDENTIAL");
  }
  return { dc, providerAccountId: integration.providerAccountId };
}

function scalarResult(metricKey: string, value: number, generatedAt: string): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: [metricKey],
    rows: [{ [metricKey]: value }],
    totals: { [metricKey]: value },
    generatedAt,
    freshness: liveFreshness(),
    warnings: [],
    truncated: false,
  };
}

function seriesResult(
  buckets: readonly MailchimpTimeBucket[],
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

export const mailchimpAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Mailchimp",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Mailchimp metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    const generatedAt = new Date().toISOString();

    // Validate the audience filter server-side BEFORE any I/O (member-count only).
    let audienceId = "";
    if (query.metricKey === "audience_member_count") {
      try {
        audienceId = parseAudienceId(query.filters?.mailchimp_audience);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Pick a Mailchimp audience.",
          "INVALID_QUERY",
        );
      }
    }

    const { dc, providerAccountId } = await resolveAccountMailchimp(ctx);
    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId, apiCall });

    try {
      // ── Scalar: current audience member count (snapshot; range-independent) ────
      if (query.metricKey === "audience_member_count") {
        const count = await run((t) => fetchAudienceMemberCount(t, dc, audienceId));
        return scalarResult("audience_member_count", count, generatedAt);
      }

      // ── Scalar: sent-campaign count over the range (exact via total_items) ─────
      if (query.metricKey === "campaign_count") {
        const scan = await run((t) =>
          scanSentCampaigns(t, dc, { sinceIso: query.range.since, untilIso: query.range.until }),
        );
        return scalarResult("campaign_count", scan.total, generatedAt);
      }

      // ── Series: campaigns sent over time (by send_time) ───────────────────────
      const buckets = planBuckets(query.range.since, query.range.until);
      if (buckets.length === 0) {
        return seriesResult([], [], generatedAt, ["The selected date range is empty or invalid."], false);
      }
      const scan = await run((t) =>
        scanSentCampaigns(t, dc, { sinceIso: query.range.since, untilIso: query.range.until }),
      );
      const counts = new Array<number>(buckets.length).fill(0);
      for (const ms of scan.sendMs) {
        const idx = bucketIndexForMs(buckets, ms);
        if (idx >= 0) counts[idx]! += 1;
      }
      const warnings = scan.truncated
        ? [`Based on the most recent ${scan.sendMs.length} sent campaigns — there were more in this range.`]
        : [];
      return seriesResult(buckets, counts, generatedAt, warnings, scan.truncated);
    } catch (err) {
      throw classifyMailchimpError(err);
    }
  },
};
