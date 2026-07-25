import type { AnalyticsSourceCatalog } from "@/contracts/analyticsCatalog";
import {
  ConnectedAnalyticsError,
  type ConnectedAnalyticsQuery,
  type ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import { getActiveForExecution } from "@/repositories/integrations";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
  refreshAndRetry,
} from "@/services/oauth/refreshAndRetry";
import {
  MAX_PAGES,
  PAGE_SIZE,
  scanChargesWindow,
  type WindowScanResult,
} from "@/services/analytics/sources/stripe/api";
import { resolveQueryRange } from "../../insightQueryTime";
import type { AnalyticsDatasetAdapter, AnalyticsExecutionContext } from "../registry";
import { aggregateStripePayments } from "./aggregate";

/**
 * Stripe → Payments connected dataset (CD-2). Provider-local declaration on
 * the CD-1 platform: catalog + thin adapter. The adapter owns credential-
 * resolved bounded scans + typed error mapping; ALL business semantics live
 * in the pure `aggregate.ts`. Cache/coalescing/limiter are platform concerns
 * wired in runConnectedQuery — NOT here.
 *
 * GROSS-not-net: this dataset reports gross charge activity. Refund-/fee-
 * adjusted measures, payouts, balances, and subscriptions are deliberately
 * absent (audit decisions 13/14) until their Stripe surfaces are implemented.
 */

export const STRIPE_SCAN_CAP = MAX_PAGES * PAGE_SIZE; // 2,000 charges/window

export const stripeInsightsCatalog: AnalyticsSourceCatalog = {
  source: {
    id: "stripe",
    providerId: "stripe",
    label: "Stripe",
    description: "Payments processed through your Stripe account.",
    credentialMode: "account",
    connectionRequired: true,
    // Implemented + fixture-proven, but live provider certification is still
    // blocked on a connected Stripe test account (CD-2 outcome). Not public
    // until that pass; flipping this to "public" is the certification switch.
    exposure: "preview",
  },
  datasets: [
    {
      id: "payments",
      label: "Payments",
      description: "Charges processed by Stripe (gross activity, not net revenue).",
      recordNoun: "payments",
      deriveCount: false, // named measures own eligibility domains
      fields: [
        {
          id: "amount",
          label: "Payment amount",
          kind: "number",
          unit: "currency",
          currencyBehavior: "per_record",
          // NOT mechanically measurable: honest monetary measures need the
          // succeeded-only eligibility predicate (named measures below).
          measurable: false,
          nullable: false,
          dimensionable: false,
          filterable: false,
          distinctCountable: false,
        },
        {
          id: "status",
          label: "Status",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          // The three charge states the aggregation layer recognizes
          // (aggregate.ts STATUS_ORDER) — declared for the generic filter UI.
          values: [
            { id: "succeeded", label: "Succeeded" },
            { id: "pending", label: "Pending" },
            { id: "failed", label: "Failed" },
          ],
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
          nullable: false,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "customer",
          label: "Customer",
          kind: "entity",
          dimensionable: false, // grouping by customer deferred (scan-honesty)
          filterable: true,
          maxSelections: 1, // maps to Stripe's server-side single-customer param
          optionsSource: "stripe:customers",
          nullable: true,
          measurable: false,
          distinctCountable: false,
        },
      ],
      dateFields: [{ id: "created", label: "Payment date", historical: true }],
      namedMeasures: [
        {
          id: "payment_count",
          label: "Payments",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "status", "currency"],
          compare: true,
        },
        {
          id: "successful_payment_count",
          label: "Successful payments",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "currency"],
          incompatibleFilters: ["status"],
          compare: true,
        },
        {
          id: "failed_payment_count",
          label: "Failed payments",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "currency"],
          incompatibleFilters: ["status"],
          compare: true,
        },
        {
          id: "gross_payment_amount",
          label: "Gross payment amount",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "zero",
          dimensions: ["time"],
          incompatibleFilters: ["status"],
          compare: true,
        },
        {
          id: "avg_payment_amount",
          label: "Average payment amount",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "null",
          dimensions: ["time"],
          incompatibleFilters: ["status"],
          compare: true,
        },
      ],
      supportedCharts: ["kpi", "line", "bar", "table"],
      partToWholeDimensions: [],
      series: [{ by: "status", max: 3, modes: [] }],
      compare: true,
      queryLimits: {
        maxRangeDays: 366,
        maxBuckets: 400,
        maxCategoryRows: 50,
        maxRecordsScanned: STRIPE_SCAN_CAP,
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
  if (err instanceof Unauthorized401Error || err instanceof IntegrationActionRequiredError) {
    return new ConnectedAnalyticsError(
      "Reconnect Stripe to keep using payment data in Analytics.",
      "RECONNECT_REQUIRED",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests|HTTP 429|\b429\b/i.test(message)) {
    return new ConnectedAnalyticsError(
      "Stripe is temporarily limiting requests. We'll use recent saved data when available.",
      "RATE_LIMITED",
    );
  }
  return new ConnectedAnalyticsError("Couldn't load Stripe data.", "PROVIDER_ERROR");
}

export const stripePaymentsAdapter: AnalyticsDatasetAdapter = {
  sourceId: "stripe",
  datasetId: "payments",
  // Server-side only — never in the client projection. Stripe Connect grants
  // the already-requested read_write scope; no new scope is required.
  requiredScopes: ["read_write"],
  async query(
    ctx: AnalyticsExecutionContext,
    query: ConnectedAnalyticsQuery,
  ): Promise<ConnectedAnalyticsResult> {
    const now = ctx.now ?? Date.now();
    // Account-class: the ACCOUNT's Stripe connection; never user-pinned.
    const integration = await getActiveForExecution(ctx.accountId, "stripe", null);
    if (!integration) {
      throw new ConnectedAnalyticsError(
        "Connect Stripe to use payment data in Analytics.",
        "MISSING_CREDENTIAL",
      );
    }

    const { fromMs, toMs } = resolveQueryRange(query.range, now);
    const customerFilter = query.filters?.["customer"];
    const customer =
      Array.isArray(customerFilter) && customerFilter.length === 1
        ? customerFilter[0]
        : undefined;
    // Window is [from, to): Stripe's created bounds are inclusive seconds.
    const windowOf = (aMs: number, bMs: number) => ({
      gteSec: Math.floor(aMs / 1000),
      lteSec: Math.floor((bMs - 1) / 1000),
      ...(customer ? { customer } : {}),
    });

    let scan: WindowScanResult;
    let prevScan: WindowScanResult | undefined;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "stripe",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken: string) =>
          scanChargesWindow(accessToken, windowOf(fromMs, toMs)),
      });
      if (query.compare === "previous_period") {
        prevScan = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: "stripe",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken: string) =>
            scanChargesWindow(accessToken, windowOf(fromMs - (toMs - fromMs), fromMs)),
        });
      }
    } catch (err) {
      throw classify(err);
    }

    return aggregateStripePayments({
      query,
      facts: scan.facts,
      prevFacts: prevScan?.facts,
      truncated: scan.truncated,
      prevTruncated: prevScan?.truncated,
      now,
      scanCap: STRIPE_SCAN_CAP,
    });
  },
};
