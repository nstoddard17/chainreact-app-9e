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
import { MAX_PAGES, PAGE_SIZE, ShopifyRateLimitError, scanOrdersWindow, type OrderFact } from "./api";
import {
  bucketIndexForMs,
  dominantCurrency,
  planBuckets,
  roundMajor,
  type ShopifyTimeBucket,
} from "./buckets";

/**
 * Shopify connected-app analytics source — v1 (Slice ANALYTICS-SOURCES-SHOPIFY-1).
 *
 * READ-ONLY. Reduces a bounded `/orders.json` window scan to numeric sales
 * aggregates (order counts + summed revenue). Never executes a workflow node, never
 * takes a raw Shopify query from widget config (the date window is built server-side
 * from the dashboard range; the shop domain comes from the integration row, never
 * config), never reads a customer, email, line item, address, note, or order
 * id/name. Approved metrics only (validated upstream).
 *
 * CREDENTIAL MODEL (account provider, per core/integrations/credentialSharing.ts):
 * Shopify is an ACCOUNT-shared store, so this resolves the ACCOUNT'S Shopify
 * connection (no per-user pin) — every account member sees the SAME store sales,
 * matching the credential semantics (like Stripe). The cache layer keys
 * account-shared providers with `source_user_id = null`. Shopify is NON-REFRESHABLE
 * (offline token); the read still runs through `refreshAndRetry`, which on a 401
 * raises `IntegrationActionRequiredError` (refresh unsupported) → mapped to
 * MISSING_CREDENTIAL (reconnect).
 *
 * PRIVACY: only order COUNTS and summed order TOTALS are computed and cached. No
 * customer ids, emails, line items, addresses, notes, order ids/names, or raw
 * payloads are returned or stored. Revenue is summed for a SINGLE (dominant)
 * currency so a total is never a meaningless cross-currency sum.
 *
 * SCOPES: uses the already-granted `read_orders` scope. No new scope is requested.
 */

const PROVIDER_KEY = "shopify";
const STATUS_PAID = "paid";

const METRICS: readonly AnalyticsSourceMetric[] = [
  {
    key: "orders_count",
    label: "Orders",
    description: "Count of orders placed over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "paid_orders_count",
    label: "Paid orders",
    description: "Count of paid orders over the range.",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "revenue_sum",
    label: "Revenue",
    description: "Total value of paid orders over the range (dominant currency).",
    visualizations: ["scalar"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "orders_over_time",
    label: "Orders over time",
    description: "Orders placed per time bucket.",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
  {
    key: "revenue_over_time",
    label: "Revenue over time",
    description: "Paid order value per time bucket (dominant currency).",
    visualizations: ["series"],
    supportedGroupBy: [],
    supportedFilters: [],
  },
];

function liveFreshness(): NormalizedAnalyticsResult["freshness"] {
  return { cached: false, ageSeconds: 0, ttlSeconds: null };
}

/** Map any error from a Shopify read into a typed, leak-free AnalyticsSourceError. */
function classifyShopifyError(err: unknown): AnalyticsSourceError {
  if (err instanceof AnalyticsSourceError) return err;
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    return new AnalyticsSourceError("Reconnect Shopify before this widget can load.", "MISSING_CREDENTIAL");
  }
  if (err instanceof ShopifyRateLimitError) {
    return new AnalyticsSourceError("Shopify's rate limit was reached. Try again shortly.", "RATE_LIMITED");
  }
  // No raw Shopify error body / token / payload leaks — a generic, safe message.
  return new AnalyticsSourceError("Couldn't load Shopify data.", "PROVIDER_ERROR");
}

/** Resolve the ACCOUNT'S Shopify connection (account-shared), or MISSING_CREDENTIAL. */
async function resolveAccountShopify(ctx: AnalyticsSourceContext): Promise<{ shopDomain: string }> {
  // No connectedByUserId pin — Shopify is account-shared (a shared store).
  const integration = await getActiveForExecution(ctx.accountId, PROVIDER_KEY, null);
  const shopDomain = integration?.providerAccountId ?? null;
  if (!integration || !shopDomain) {
    throw new AnalyticsSourceError("Connect Shopify to use this widget.", "MISSING_CREDENTIAL");
  }
  return { shopDomain };
}

function truncationWarning(truncated: boolean): string[] {
  return truncated
    ? [`Based on the most recent ${MAX_PAGES * PAGE_SIZE} orders. There were more in this range than that.`]
    : [];
}

function multiCurrencyWarning(currency: string | null, multiCurrency: boolean): string[] {
  if (!multiCurrency || !currency) return [];
  return [`Revenue shown in ${currency.toUpperCase()}. Orders in other currencies were excluded.`];
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
  buckets: readonly ShopifyTimeBucket[],
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

export const shopifyAnalyticsSource: AnalyticsSourceAdapter = {
  providerKey: PROVIDER_KEY,
  displayName: "Shopify",
  connectedApp: true,
  // A query makes ≤10 bounded GETs to /orders.json; cache 10 min so repeated
  // dashboard loads don't re-scan orders (and stay clear of rate limits).
  cacheTtlSeconds: 600,
  metrics: METRICS,

  async query(
    query: AnalyticsSourceQuery,
    ctx: AnalyticsSourceContext,
  ): Promise<NormalizedAnalyticsResult> {
    const metric = METRICS.find((m) => m.key === query.metricKey);
    if (!metric) {
      throw new AnalyticsSourceError(`Unknown Shopify metric: ${query.metricKey}`, "UNKNOWN_METRIC");
    }

    const generatedAt = new Date().toISOString();
    const sinceMs = Date.parse(query.range.since);
    const untilMs = Date.parse(query.range.until);
    if (Number.isNaN(sinceMs) || Number.isNaN(untilMs) || untilMs <= sinceMs) {
      throw new AnalyticsSourceError("Invalid date range.", "INVALID_QUERY");
    }

    const { shopDomain } = await resolveAccountShopify(ctx);

    let scan;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: PROVIDER_KEY,
        providerAccountId: shopDomain,
        apiCall: (accessToken: string) =>
          scanOrdersWindow(shopDomain, accessToken, { sinceIso: query.range.since, untilIso: query.range.until }),
      });
    } catch (err) {
      throw classifyShopifyError(err);
    }

    const facts: readonly OrderFact[] = scan.facts;
    const paid = facts.filter((f) => f.status === STATUS_PAID);
    const truncated = scan.truncated;

    // ── Count scalars ─────────────────────────────────────────────────────────
    if (query.metricKey === "orders_count") {
      return scalarResult("orders_count", facts.length, generatedAt, truncationWarning(truncated), truncated);
    }
    if (query.metricKey === "paid_orders_count") {
      return scalarResult("paid_orders_count", paid.length, generatedAt, truncationWarning(truncated), truncated);
    }

    // ── Revenue scalar (paid orders, single dominant currency) ────────────────
    if (query.metricKey === "revenue_sum") {
      const dom = dominantCurrency(paid);
      const total = roundMajor(
        paid.filter((f) => f.currency === dom.currency).reduce((sum, f) => sum + f.amount, 0),
      );
      const warnings = [...multiCurrencyWarning(dom.currency, dom.multiCurrency), ...truncationWarning(truncated)];
      return scalarResult("revenue_sum", total, generatedAt, warnings, truncated);
    }

    // ── Series ────────────────────────────────────────────────────────────────
    const buckets = planBuckets(query.range.since, query.range.until);
    if (buckets.length === 0) {
      return seriesResult([], [], generatedAt, ["The selected date range is empty or invalid."], truncated);
    }

    if (query.metricKey === "orders_over_time") {
      const counts = new Array<number>(buckets.length).fill(0);
      for (const f of facts) {
        const idx = bucketIndexForMs(buckets, f.createdMs);
        if (idx >= 0) counts[idx]! += 1;
      }
      return seriesResult(buckets, counts, generatedAt, truncationWarning(truncated), truncated);
    }

    // revenue_over_time (paid orders, dominant currency)
    const dom = dominantCurrency(paid);
    const volumes = new Array<number>(buckets.length).fill(0);
    for (const f of paid) {
      if (f.currency !== dom.currency) continue;
      const idx = bucketIndexForMs(buckets, f.createdMs);
      if (idx >= 0) volumes[idx]! += f.amount;
    }
    const rounded = volumes.map(roundMajor);
    const warnings = [...multiCurrencyWarning(dom.currency, dom.multiCurrency), ...truncationWarning(truncated)];
    return seriesResult(buckets, rounded, generatedAt, warnings, truncated);
  },
};
