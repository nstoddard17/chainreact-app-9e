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
import {
  HubSpotRateLimitError,
  createdInRangeFilters,
  dealsInStageFilters,
  fetchDealStages,
  searchTotal,
  type CrmObjectType,
  type DealStage,
} from "./api";
import { parsePipelineId, planBuckets, type HubSpotTimeBucket } from "./buckets";

/**
 * HubSpot connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-HUBSPOT-1).
 *
 * READ-ONLY + STRICTLY COUNT-ONLY. Every metric is a HubSpot CRM Search `total`
 * count — created-over-time series (one bounded `createdate`-window count per bucket)
 * and open / closed-won deal scalars. Never executes a workflow node, never takes a
 * raw HubSpot search document from widget config (object type is a fixed literal;
 * filters are server-side constants), and never reads a CRM record's properties.
 * Approved metrics only (validated upstream). No picker — no filters on any metric.
 *
 * CREDENTIAL MODEL (account provider, per core/integrations/credentialSharing.ts):
 * HubSpot is an ACCOUNT-shared portal grant, so this resolves the ACCOUNT'S HubSpot
 * connection (no per-user pin) — every account member sees the same portal-level
 * aggregates. The cache layer keys account-shared providers with
 * `source_user_id = null`. HubSpot is REFRESHABLE → reads run through
 * `refreshAndRetry` (401 → refresh + retry once → reconnect signal on permanent
 * failure). No connection → typed MISSING_CREDENTIAL.
 *
 * PRIVACY: only COUNTS are computed and cached (deal/contact/company/ticket totals,
 * created timing, and per-stage deal counts). No contact names, emails, phone numbers,
 * company names, deal names, amounts, notes, owner names, associations, urls, object
 * ids, or raw HubSpot payloads are returned or stored — the reader requests
 * `properties: []` and reads only `total`. The ONLY text surfaced is deal-pipeline
 * STAGE LABELS on `deals_by_stage` (account-level structure labels, like Trello list
 * names / Monday group titles).
 *
 * SCOPES: uses only already-granted read scopes (`crm.objects.contacts.read`,
 * `crm.objects.companies.read`, `crm.objects.deals.read`, `tickets`,
 * `crm.schemas.deals.read` for the pipeline/stage structure). No new scope is requested.
 */

const PROVIDER_KEY = "hubspot";

/** Standard HubSpot deal properties used for the closed/closed-won scalars. */
const DEAL_IS_CLOSED = "hs_is_closed";
const DEAL_IS_CLOSED_WON = "hs_is_closed_won";

/** UI/route filter key carrying the selected deal pipeline for deals_by_stage. */
const PIPELINE_FILTER = ["hubspot_pipeline"] as const;

/** Which CRM object a created-over-time metric counts. */
const SERIES_OBJECT: Readonly<Record<string, CrmObjectType>> = {
  contacts_created_over_time: "contacts",
  deals_created_over_time: "deals",
  companies_created_over_time: "companies",
  tickets_created_over_time: "tickets",
};

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "open_deals_count",
    label: "Open deals",
    description: "Deals that are not yet closed.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "closed_won_deals_count",
    label: "Closed-won deals",
    description: "Deals won across the portal.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "contacts_created_over_time",
    label: "Contacts created over time",
    description: "Contacts created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "deals_created_over_time",
    label: "Deals created over time",
    description: "Deals created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "companies_created_over_time",
    label: "Companies created over time",
    description: "Companies created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "tickets_created_over_time",
    label: "Tickets created over time",
    description: "Tickets created per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "deals_by_stage",
    label: "Deals by stage",
    description: "Deal count per stage in the selected pipeline.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: PIPELINE_FILTER,
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a HubSpot read into a typed, leak-free AnalyticsSourceError. */
function classifyHubSpotError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect HubSpot before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof HubSpotRateLimitError) {
    return new AnalyticsSourceError("HubSpot's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw HubSpot error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load HubSpot data.", "PROVIDER_ERROR");
}

/** Confirm the ACCOUNT has a HubSpot connection (account-shared; no per-user pin). */
async function requireAccountHubSpot(ctx: AnalyticsSourceContext): Promise<void> {
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null);
  if (!integration) {
    throw new AnalyticsSourceError("Connect HubSpot to use this widget.", "MISSING_CREDENTIAL");
  }
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
  buckets: readonly HubSpotTimeBucket[],
  counts: readonly number[],
  generatedAt: string,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: buckets.map((b, i) => ({ date: b.key, count: counts[i] ?? 0 })),
    totals: { count: counts.reduce((a, b) => a + b, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings: [],
    truncated: false,
  };
}

function barResult(
  stages: readonly DealStage[],
  counts: readonly number[],
  generatedAt: string,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["stage"],
    measures: ["count"],
    // Stage LABEL only (structure label), keyed as `date` so the shared bar renderer
    // (ConnectedAppWidgetBody) shows it as the category — no deal record data.
    rows: stages.map((s, i) => ({ date: s.label, count: counts[i] ?? 0 })),
    totals: { count: counts.reduce((a, b) => a + b, 0) },
    generatedAt,
    freshness: liveFreshness(),
    warnings: [],
    truncated: false,
  };
}

function emptySeries(generatedAt: string, warning: string): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: [],
    totals: { count: 0 },
    generatedAt,
    freshness: liveFreshness(),
    warnings: [warning],
    truncated: false,
  };
}

export const hubspotAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "HubSpot",
  connectedApp: true,
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown HubSpot metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    const generatedAt = new Date().toISOString();

    // Validate the pipeline filter server-side BEFORE any I/O (deals_by_stage only).
    let pipelineId = "";
    if (query.metricKey === "deals_by_stage") {
      try {
        pipelineId = parsePipelineId(query.filters?.hubspot_pipeline);
      } catch (err) {
        throw new AnalyticsSourceError(
          err instanceof Error ? err.message : "Pick a HubSpot deal pipeline.",
          "INVALID_QUERY",
        );
      }
    }

    await requireAccountHubSpot(ctx);
    // Account-shared: providerAccountId null (the account's single HubSpot portal).
    const run = <T>(apiCall: (accessToken: string) => Promise<T>): Promise<T> =>
      refreshAndRetry({ accountId: ctx.accountId, provider: PROVIDER_KEY, providerAccountId: null, apiCall });

    try {
      // ── Scalars: open + closed-won deal counts (Search `total`, no record data) ──
      if (query.metricKey === "open_deals_count") {
        const count = await run((t) =>
          searchTotal({
            accessToken: t,
            objectType: "deals",
            filters: [{ propertyName: DEAL_IS_CLOSED, operator: "EQ", value: "false" }],
          }),
        );
        return scalarResult("open_deals_count", count, generatedAt);
      }
      if (query.metricKey === "closed_won_deals_count") {
        const count = await run((t) =>
          searchTotal({
            accessToken: t,
            objectType: "deals",
            filters: [{ propertyName: DEAL_IS_CLOSED_WON, operator: "EQ", value: "true" }],
          }),
        );
        return scalarResult("closed_won_deals_count", count, generatedAt);
      }

      // ── Bar: deals by stage (per-stage Search count; stage labels only) ─────────
      if (query.metricKey === "deals_by_stage") {
        const { stages, counts } = await run(async (t) => {
          const stages = await fetchDealStages(t, pipelineId);
          const counts: number[] = [];
          for (const s of stages) {
            counts.push(await searchTotal({ accessToken: t, objectType: "deals", filters: dealsInStageFilters(pipelineId, s.id) }));
          }
          return { stages, counts };
        });
        if (stages.length === 0) {
          // Pipeline id unknown (renamed / archived) or has no live stages — safe
          // config error so the widget prompts a re-pick rather than rendering blank.
          throw new AnalyticsSourceError(
            "That HubSpot pipeline is unavailable. Re-pick a pipeline for this widget.",
            "INVALID_QUERY",
          );
        }
        return barResult(stages, counts, generatedAt);
      }

      // ── Series: created-over-time (one bounded count per bucket window) ──────────
      const objectType = SERIES_OBJECT[query.metricKey];
      if (!objectType) {
        // Defensive — METRICS + SERIES_OBJECT are kept in sync.
        throw new AnalyticsSourceError(`Unknown HubSpot metric: ${query.metricKey}`, "UNKNOWN_METRIC");
      }
      const buckets = planBuckets(query.range.since, query.range.until);
      if (buckets.length === 0) {
        return emptySeries(generatedAt, "The selected date range is empty or invalid.");
      }
      // One token resolution; sequential per-bucket counts (naturally throttled).
      const counts = await run(async (t) => {
        const out: number[] = [];
        for (const b of buckets) {
          out.push(await searchTotal({ accessToken: t, objectType, filters: createdInRangeFilters(b.startMs, b.endMs) }));
        }
        return out;
      });
      return seriesResult(buckets, counts, generatedAt);
    } catch (err) {
      throw classifyHubSpotError(err);
    }
  },
};
