import type { AnalyticsSourceCatalog } from "@/contracts/analyticsCatalog";
import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import { getActiveForExecution } from "@/repositories/integrations";
import {
  InsufficientScopeError,
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  INSIGHT_MAX_PAGES,
  INSIGHT_PAGE_SIZE,
  scanOrderFactsWindow,
  type ShopifyOrderScanResult,
} from "@/services/analytics/sources/shopify/insightOrders";
import { resolveQueryRange } from "../../insightQueryTime";
import type { AnalyticsDatasetAdapter, AnalyticsExecutionContext } from "../registry";
import { aggregateShopifyOrders } from "./aggregate";
import { FINANCIAL_STATUS_LABELS, FULFILLMENT_STATUS_LABELS } from "./measures";

/**
 * Shopify → Orders connected dataset (CD-4C). Provider-local declaration on
 * the CD-1 platform: catalog + thin adapter. The adapter owns credential-
 * resolved bounded scans and typed error mapping; ALL business semantics live
 * in the pure `aggregate.ts` / `measures.ts`. Cache/coalescing/limiter are
 * platform concerns wired in runConnectedQuery — NOT here.
 *
 * LIVE-CERTIFIED before implementation (CD-4C Phase A, read-only): the stored
 * connection owns the shop it queries (/shop.json identity match), order reads
 * under the existing read_orders scope, created_at push-down narrowing,
 * Link-cursor paging with the explicit `order=created_at desc` sort (no
 * duplicates, no skips, cursor-terminated), money as major-unit decimal
 * strings, ISO currency on every order, boolean test markers, and
 * null-or-ISO cancelled_at. All observed orders were financially "paid", so
 * the WIDER financial-status domain is normalized from Shopify's documented
 * values and fixture-proven, not live-proven — recorded honestly in the
 * outcome doc.
 *
 * CHARGED-not-collected: "Total order amount" sums Shopify ORDER TOTALS.
 * Refunds are NOT subtracted (complete refund amounts are not projected), and
 * it is never called revenue, net sales, payouts, or profit. Test orders are
 * EXCLUDED by default from every measure.
 */

/** 10 pages × 250 orders per window scan before truncation. */
export const SHOPIFY_SCAN_CAP = INSIGHT_MAX_PAGES * INSIGHT_PAGE_SIZE;

const statusValues = (
  order: readonly string[],
  labels: Readonly<Record<string, string>>,
) => order.map((id) => ({ id, label: labels[id]! }));

export const shopifyInsightsCatalog: AnalyticsSourceCatalog = {
  source: {
    id: "shopify",
    providerId: "shopify",
    label: "Shopify",
    description: "Orders from your Shopify store.",
    credentialMode: "account",
    connectionRequired: true,
    // Live-certified read-only against the connected dev store (CD-4C Phase
    // A): identity, reads, filtering, paging and wire types all observed, so
    // the dataset ships exposed rather than preview-gated.
    exposure: "public",
  },
  datasets: [
    {
      id: "orders",
      label: "Orders",
      description:
        "Orders placed in your store — how many, what they totalled at checkout, and their payment and fulfillment states.",
      recordNoun: "orders",
      deriveCount: false, // named measures own their eligibility domains
      fields: [
        {
          id: "order_id",
          label: "Order",
          // IDENTIFIER ONLY. `text` is display-only in the derivation, so this
          // can never become a measure, grouping or filter — and the scanner
          // never reads an order id into a fact, so it can never reach a
          // result or the snapshot cache either.
          kind: "text",
          nullable: false,
          measurable: false,
          dimensionable: false,
          filterable: false,
          distinctCountable: false,
        },
        {
          id: "total_amount",
          label: "Order total",
          kind: "number",
          unit: "currency",
          currencyBehavior: "per_record",
          // NOT mechanically measurable: honest money must skip unreadable
          // amounts and divide averages by that same domain — the named
          // measures below own both rules.
          measurable: false,
          nullable: true,
          dimensionable: false,
          filterable: false,
          distinctCountable: false,
        },
        {
          id: "financial_status",
          label: "Payment status",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          // The normalized bounded domain (measures.ts). Every order maps to
          // exactly one value — the partition that makes a donut honest.
          values: statusValues(
            ["paid", "pending", "authorized", "partially_paid", "partially_refunded", "refunded", "voided", "unknown"],
            FINANCIAL_STATUS_LABELS,
          ),
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "fulfillment_status",
          label: "Fulfillment status",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          // Shopify's null (= not yet fulfilled) is normalized to an explicit
          // first-class "Unfulfilled" value, never null noise.
          values: statusValues(
            ["unfulfilled", "partial", "fulfilled", "restocked", "unknown"],
            FULFILLMENT_STATUS_LABELS,
          ),
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "currency",
          label: "Currency",
          kind: "category",
          dimensionable: true,
          cardinality: "bounded",
          filterable: true,
          nullable: true,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "cancellation_state",
          label: "Cancellation",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          // Derived from the live-certified cancelled_at timestamp (null-or-
          // ISO), never inferred from a financial status.
          values: [
            { id: "active", label: "Active" },
            { id: "cancelled", label: "Cancelled" },
          ],
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "include_test_orders",
          label: "Include test orders",
          // Boolean toggle filter. DEFAULT OFF = test orders are EXCLUDED
          // from every measure (measures.ts applyFilters) — a merchant's
          // business totals never silently include Bogus-gateway/test-mode
          // transactions. Toggling it on includes them.
          kind: "boolean",
          nullable: false,
          measurable: false,
          dimensionable: false,
          filterable: true,
          distinctCountable: false,
        },
      ],
      dateFields: [{ id: "created_at", label: "Order date", historical: true }],
      namedMeasures: [
        {
          id: "order_count",
          label: "Order count",
          description: "How many orders were placed.",
          unit: "count",
          emptyValue: "zero",
          dimensions: [
            "time",
            "financial_status",
            "fulfillment_status",
            "currency",
            "cancellation_state",
          ],
          compare: true,
        },
        {
          id: "paid_order_count",
          label: "Paid order count",
          description: "Orders whose payment status is exactly Paid.",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "currency"],
          incompatibleFilters: ["financial_status"],
          compare: true,
        },
        {
          id: "total_order_amount",
          label: "Total order amount",
          description:
            "The sum of matching Shopify order totals — what was charged at checkout. Not net sales, refunds are not subtracted, and not payouts.",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "zero",
          // Time only: one result carries ONE currency code, so a money
          // breakdown by status/currency can't be represented truthfully in
          // the common contract. Statuses and currency stay FILTERS for money.
          dimensions: ["time"],
          compare: true,
        },
        {
          id: "avg_order_amount",
          label: "Average order amount",
          description: "Average checkout total of the same matching orders.",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "null",
          dimensions: ["time"],
          compare: true,
        },
      ],
      supportedCharts: ["kpi", "line", "bar", "table", "donut"],
      // Both status domains PARTITION every order (normalization maps each
      // order to exactly one value, missing values included), so an order
      // COUNT by either is a true part-to-whole. Currency and cancellation
      // are not declared: a currency donut invites reading it as a money
      // split, and cancellation is binary — a bar says it better.
      partToWholeDimensions: ["financial_status", "fulfillment_status"],
      series: [
        // Automatic keys: the statuses observed in the window, canonical
        // order, bounded by the domain size (≤8 / ≤5 by construction).
        { by: "financial_status", max: 8, modes: [] },
        { by: "fulfillment_status", max: 5, modes: [] },
      ],
      compare: true,
      queryLimits: {
        maxRangeDays: 366,
        maxBuckets: 400,
        maxCategoryRows: 50,
        maxRecordsScanned: SHOPIFY_SCAN_CAP,
      },
      freshness: { mode: "cached", ttlSeconds: 600 },
      executionMode: "provider_snapshot",
      previewSafe: true,
      drilldown: false,
    },
  ],
};

function classify(err: unknown): ConnectedAnalyticsError {
  if (err instanceof ConnectedAnalyticsError) return err;
  if (
    err instanceof Unauthorized401Error ||
    err instanceof IntegrationActionRequiredError ||
    err instanceof InsufficientScopeError
  ) {
    return new ConnectedAnalyticsError(
      "Reconnect Shopify to keep using order data in Analytics.",
      "RECONNECT_REQUIRED",
    );
  }
  const name = err instanceof Error ? err.constructor.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "ShopifyRateLimitError" || /rate.?limit|too many requests|\b429\b/i.test(message)) {
    return new ConnectedAnalyticsError(
      "Shopify is temporarily limiting requests. We'll use recent saved data when available.",
      "RATE_LIMITED",
    );
  }
  return new ConnectedAnalyticsError("Couldn't load Shopify data.", "PROVIDER_ERROR");
}

export const shopifyOrdersAdapter: AnalyticsDatasetAdapter = {
  sourceId: "shopify",
  datasetId: "orders",
  // Server-side only — never in the client projection. read_orders is ALREADY
  // granted; CD-4C requests nothing new.
  requiredScopes: ["read_orders"],
  async query(
    ctx: AnalyticsExecutionContext,
    query: ConnectedAnalyticsQuery,
  ): Promise<ConnectedAnalyticsResult> {
    const now = ctx.now ?? Date.now();
    // Account-class: the ACCOUNT's Shopify connection; never user-pinned, and
    // the shop domain comes from the stored row — never from the client.
    const integration = await getActiveForExecution(ctx.accountId, "shopify", null);
    if (!integration || !integration.providerAccountId) {
      throw new ConnectedAnalyticsError(
        "Connect Shopify to use order data in Analytics.",
        "MISSING_CREDENTIAL",
      );
    }
    const shopDomain = integration.providerAccountId;

    const { fromMs, toMs } = resolveQueryRange(query.range, now);
    // Shopify's created_at bounds are INCLUSIVE; the platform window is
    // [from, to). Asking for `to - 1ms` keeps the exclusive end honest; the
    // aggregation re-applies the exact bound anyway.
    const windowOf = (aMs: number, bMs: number) => ({
      sinceIso: new Date(aMs).toISOString(),
      untilIso: new Date(bMs - 1).toISOString(),
    });

    let scan: ShopifyOrderScanResult;
    let prevScan: ShopifyOrderScanResult | undefined;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "shopify",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken: string) =>
          scanOrderFactsWindow(shopDomain, accessToken, windowOf(fromMs, toMs)),
      });
      if (query.compare === "previous_period") {
        prevScan = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: "shopify",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken: string) =>
            scanOrderFactsWindow(
              shopDomain,
              accessToken,
              windowOf(fromMs - (toMs - fromMs), fromMs),
            ),
        });
      }
    } catch (err) {
      throw classify(err);
    }

    return aggregateShopifyOrders({
      query,
      facts: scan.facts,
      ...(prevScan ? { prevFacts: prevScan.facts } : {}),
      truncated: scan.truncated,
      ...(prevScan ? { prevTruncated: prevScan.truncated } : {}),
      malformedAmounts: scan.malformedAmounts + (prevScan?.malformedAmounts ?? 0),
      now,
      scanCap: SHOPIFY_SCAN_CAP,
    });
  },
};
