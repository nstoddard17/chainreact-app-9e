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
import { MAX_PAGES, PAGE_SIZE, scanChargesWindow, type ChargeFact } from "./api";
import {
  bucketIndexForMs,
  dominantCurrency,
  minorToMajor,
  planBuckets,
  roundMajor,
  type StripeTimeBucket,
} from "./buckets";

/**
 * Stripe connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-STRIPE-1).
 *
 * READ-ONLY. Reduces a bounded `/v1/charges` window scan to numeric payment
 * aggregates (counts + summed volume). Never executes a workflow node, never
 * takes a raw Stripe query from widget config (the date window is built
 * server-side from the dashboard range), never reads a charge's customer,
 * description, receipt, or card detail. Approved metrics only (validated upstream).
 *
 * CREDENTIAL MODEL (account provider, per core/integrations/credentialSharing.ts):
 * Stripe is an ACCOUNT-shared business resource, so this resolves the ACCOUNT'S
 * Stripe connection (no per-user pin) — every account member sees the SAME
 * business revenue, matching the credential semantics (like Slack). The cache
 * layer keys account-shared providers with `source_user_id = null`, so there is
 * no per-member snapshot. Stripe is REFRESHABLE → the read runs through
 * `refreshAndRetry`; an unrecoverable auth failure maps to MISSING_CREDENTIAL.
 *
 * PRIVACY: only payment COUNTS and summed AMOUNTS are computed and cached. No
 * customer ids, descriptions, receipts, payment-intent ids, charge ids, card
 * detail, metadata, or raw payloads are returned or stored. Volume is summed for a
 * SINGLE (dominant) currency so a total is never a meaningless cross-currency sum.
 *
 * SCOPES: uses the already-granted Stripe Connect `read_write` scope for read-only
 * GETs. No new scope is requested.
 */

const PROVIDER_KEY = "stripe";
const STATUS_SUCCEEDED = "succeeded";
const STATUS_FAILED = "failed";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "successful_payment_count",
    label: "Successful payments",
    description: "Count of succeeded payments over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "gross_payment_volume",
    label: "Gross payment volume",
    description: "Total amount of succeeded payments over the range (dominant currency).",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "failed_payment_count",
    label: "Failed payments",
    description: "Count of failed payments over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "successful_payments_over_time",
    label: "Successful payments over time",
    description: "Succeeded payments per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "gross_volume_over_time",
    label: "Gross volume over time",
    description: "Succeeded payment volume per time bucket (dominant currency).",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Stripe read into a typed, leak-free AnalyticsSourceError. */
function classifyStripeError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError(
      "Reconnect Stripe before this widget can load.",
      "MISSING_CREDENTIAL",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new AnalyticsSourceError("Stripe's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Stripe error envelope / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Stripe data.", "PROVIDER_ERROR");
}

/** Resolve the ACCOUNT'S Stripe connection (account-shared), or MISSING_CREDENTIAL. */
async function resolveAccountStripe(
  ctx: AnalyticsSourceContext,
): Promise<{ providerAccountId: string | null }> {
  // No connectedByUserId pin — Stripe is account-shared (a shared business account).
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null);
  if (!integration) {
    throw new AnalyticsSourceError("Connect Stripe to use this widget.", "MISSING_CREDENTIAL");
  }
  return { providerAccountId: integration.providerAccountId };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? [`Based on the most recent ${MAX_PAGES * PAGE_SIZE} payments. There were more in this range than that.`]
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
  buckets: readonly StripeTimeBucket[],
  values: readonly number[],
  generatedAt: string,
  warnings: string[],
  truncated: boolean,
): NormalizedAnalyticsResult {
  return {
    shape: "series",
    dimensions: ["date"],
    measures: ["count"],
    rows: buckets.map((b, i) => ({ date: b.key, count: values[i] ?? 0 })),
    totals: { count: roundMajor(values.reduce((a, b) => a + b, 0)) },
    generatedAt,
    freshness: liveFreshness(),
    warnings,
    truncated,
  };
}

/** Warning naming the dominant currency when more than one was present. */
function multiCurrencyWarning(currency: string | null, multiCurrency: boolean): string[] {
  if (!multiCurrency || !currency) return [];
  return [`Volume shown in ${currency.toUpperCase()}. Payments in other currencies were excluded.`];
}

export const stripeAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Stripe",
  connectedApp: true,
  // A query makes ≤20 bounded GETs to /v1/charges; cache 10 min so repeated
  // dashboard loads don't re-scan the ledger (and stay clear of rate limits).
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Stripe metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    const generatedAt = new Date().toISOString();
    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);
    if (Number.isNaN(sinceMs) || Number.isNaN(untilMs) || untilMs <= sinceMs) {
      throw new AnalyticsSourceError("Invalid date range.", "INVALID_QUERY");
    }
    const gteSec = Math.floor(sinceMs / 1000);
    const lteSec = Math.floor(untilMs / 1000);

    const { providerAccountId } = await resolveAccountStripe(ctx);

    let scan;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: PROVIDER_KEY,
        providerAccountId,
        apiCall: (accessToken: string) => scanChargesWindow(accessToken, { gteSec, lteSec }),
      });
    } catch (err) {
      throw classifyStripeError(err);
    }

    const facts: readonly ChargeFact[] = scan.facts;
    const succeeded = facts.filter((f) => f.status === STATUS_SUCCEEDED);
    const truncated = scan.truncated;

    // ── Count scalars ─────────────────────────────────────────────────────────
    if (query.metricKey === "successful_payment_count") {
      return scalarResult("successful_payment_count", succeeded.length, generatedAt, truncationWarning(truncated), truncated);
    }
    if (query.metricKey === "failed_payment_count") {
      const failed = facts.filter((f) => f.status === STATUS_FAILED).length;
      return scalarResult("failed_payment_count", failed, generatedAt, truncationWarning(truncated), truncated);
    }

    // ── Volume scalar (single dominant currency) ──────────────────────────────
    if (query.metricKey === "gross_payment_volume") {
      const dom = dominantCurrency(succeeded);
      const total = roundMajor(
        succeeded
          .filter((f) => f.currency.toLowerCase() === dom.currency)
          .reduce((sum, f) => sum + minorToMajor(f.amount, f.currency), 0),
      );
      const warnings = [...multiCurrencyWarning(dom.currency, dom.multiCurrency), ...truncationWarning(truncated)];
      return scalarResult("gross_payment_volume", total, generatedAt, warnings, truncated);
    }

    // ── Series ────────────────────────────────────────────────────────────────
    const buckets = planBuckets(query.range.since, query.range.until);
    if (buckets.length === 0) {
      return seriesResult([], [], generatedAt, ["The selected date range is empty or invalid."], truncated);
    }

    if (query.metricKey === "successful_payments_over_time") {
      const counts = new Array<number>(buckets.length).fill(0);
      for (const f of succeeded) {
        const idx = bucketIndexForMs(buckets, f.created * 1000);
        if (idx >= 0) counts[idx]! += 1;
      }
      return seriesResult(buckets, counts, generatedAt, truncationWarning(truncated), truncated);
    }

    // gross_volume_over_time
    const dom = dominantCurrency(succeeded);
    const volumes = new Array<number>(buckets.length).fill(0);
    for (const f of succeeded) {
      if (f.currency.toLowerCase() !== dom.currency) continue;
      const idx = bucketIndexForMs(buckets, f.created * 1000);
      if (idx >= 0) volumes[idx]! += minorToMajor(f.amount, f.currency);
    }
    const rounded = volumes.map(roundMajor);
    const warnings = [...multiCurrencyWarning(dom.currency, dom.multiCurrency), ...truncationWarning(truncated)];
    return seriesResult(buckets, rounded, generatedAt, warnings, truncated);
  },
};
