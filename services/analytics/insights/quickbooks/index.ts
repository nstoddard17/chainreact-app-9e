import { createHash } from "node:crypto";
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
  MAX_PAGES,
  PAGE_SIZE,
  scanInvoiceWindow,
  type InvoiceScanResult,
} from "@/services/analytics/sources/quickbooks/api";
import { resolveQueryRange } from "../../insightQueryTime";
import type { AnalyticsDatasetAdapter, AnalyticsExecutionContext } from "../registry";
import { aggregateQuickbooksInvoices } from "./aggregate";

/**
 * QuickBooks → Invoices connected dataset (CD-4B). Provider-local declaration
 * on the CD-1 platform: catalog + thin adapter. The adapter owns credential-
 * resolved bounded scans and typed error mapping; ALL business semantics live
 * in the pure `aggregate.ts`. Cache/coalescing/limiter are platform concerns
 * wired in runConnectedQuery — NOT here.
 *
 * LIVE-CERTIFIED before implementation (CD-4B Phase A, read-only): realm
 * ownership (and a negative control proving the token is realm-bound), invoice
 * reads under the existing accounting scope, TxnDate and CustomerRef
 * push-down, STARTPOSITION paging over 13 pages with no duplicates or skips,
 * money arriving as JSON numbers, CurrencyRef present on every invoice, and
 * paid/open semantics. No new scope, no new endpoint, no write.
 *
 * BILLED-not-collected: this dataset reports what was INVOICED and what is
 * still OWED. Revenue recognition, cash collected, payments, expenses, AR
 * aging and P&L are deliberately absent — they need accounting semantics or
 * the Reports API, which this slice does not implement.
 */

/** 20 pages × 100 invoices per window scan before truncation. */
export const QUICKBOOKS_SCAN_CAP = MAX_PAGES * PAGE_SIZE;

export const quickbooksInsightsCatalog: AnalyticsSourceCatalog = {
  source: {
    id: "quickbooks",
    providerId: "quickbooks",
    label: "QuickBooks",
    description: "Invoices from your QuickBooks company.",
    credentialMode: "account",
    connectionRequired: true,
    // Live-certified read-only against the connected company (CD-4B Phase A):
    // every required field, predicate and pagination behaviour was observed,
    // so the dataset ships exposed rather than preview-gated.
    exposure: "public",
  },
  datasets: [
    {
      id: "invoices",
      label: "Invoices",
      description: "Invoices you've issued, what they totalled, and what's still owed.",
      recordNoun: "invoices",
      deriveCount: false, // named measures own their eligibility domains
      fields: [
        {
          id: "invoice_id",
          label: "Invoice",
          // IDENTIFIER ONLY. `text` is display-only in the derivation, so this
          // can never become a measure, a grouping or a filter — and the
          // adapter never puts an invoice id in a fact, so it can never reach
          // a result or the snapshot cache either.
          kind: "text",
          nullable: false,
          measurable: false,
          dimensionable: false,
          filterable: false,
          distinctCountable: false,
        },
        {
          id: "total_amount",
          label: "Invoice total",
          kind: "number",
          unit: "currency",
          currencyBehavior: "per_record",
          // NOT mechanically measurable: an honest total must skip invoices
          // whose amount couldn't be read, and the average must divide by that
          // same domain. The named measures below own both rules.
          measurable: false,
          nullable: true,
          dimensionable: false,
          filterable: false,
          distinctCountable: false,
        },
        {
          id: "balance",
          label: "Balance due",
          kind: "number",
          unit: "currency",
          currencyBehavior: "per_record",
          measurable: false,
          nullable: true,
          dimensionable: false,
          filterable: false,
          distinctCountable: false,
        },
        {
          id: "customer",
          label: "Customer",
          kind: "entity",
          dimensionable: true,
          // Bounded, not high: a customer breakdown is capped at
          // `maxCategoryRows` and reports `row_capped` when it overflows, so
          // the grouping can never fan out unbounded.
          cardinality: "bounded",
          filterable: true,
          // One customer maps to QuickBooks' `CustomerRef = '…'` predicate,
          // which is pushed server-side (the query language has no OR).
          maxSelections: 1,
          optionsSource: "quickbooks:customers",
          nullable: true,
          measurable: false,
          distinctCountable: false,
        },
        {
          id: "paid_status",
          label: "Paid status",
          kind: "category",
          dimensionable: true,
          cardinality: "low",
          filterable: true,
          // Derived from the balance alone so the two values PARTITION every
          // invoice (aggregate.ts paidStatusOf) — that is what makes the
          // part-to-whole donut of invoice count truthful.
          values: [
            { id: "outstanding", label: "Outstanding" },
            { id: "paid", label: "Paid" },
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
          nullable: true,
          measurable: false,
          distinctCountable: false,
        },
      ],
      dateFields: [
        { id: "txn_date", label: "Invoice date", historical: true },
        // Context//filter field for later overdue analytics. NOT historical:
        // charting by due date would answer "when was money DUE", not "when
        // did I invoice", and no launch question needs it — declaring it
        // non-historical makes it structurally incapable of driving the time
        // axis (validateQuery rejects it; the client projection drops it).
        { id: "due_date", label: "Due date", historical: false },
      ],
      namedMeasures: [
        {
          id: "invoice_count",
          label: "Invoice count",
          description: "How many invoices you issued.",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["time", "customer", "paid_status", "currency"],
          compare: true,
        },
        {
          id: "total_invoiced_amount",
          label: "Total invoiced amount",
          description: "The original total of the invoices you issued — billed, not collected.",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "zero",
          // No `currency` grouping: one result carries ONE currency code, so a
          // per-currency money breakdown can't be represented truthfully.
          // Currency stays available as a filter.
          dimensions: ["time", "customer"],
          compare: true,
        },
        {
          id: "avg_invoice_amount",
          label: "Average invoice amount",
          description: "Average original invoice total.",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "null",
          dimensions: ["time", "customer"],
          compare: true,
        },
        {
          id: "outstanding_balance",
          label: "Outstanding balance",
          description: "What's still owed on your invoices right now.",
          unit: "currency",
          currencyBehavior: "per_record",
          emptyValue: "zero",
          // CURRENT STATE — no `time`. QuickBooks stores one balance per
          // invoice (its balance now), not a balance history, so bucketing
          // today's balances by old invoice dates would draw a line that reads
          // as "what I was owed then" and isn't. Also no `paid_status`: every
          // invoice with a balance is by definition Outstanding, so the
          // breakdown would be one bar — and it keeps the donut off this
          // measure without any QuickBooks-specific UI rule.
          dimensions: ["customer"],
          // Comparison needs two points in time; there is only one snapshot.
          compare: false,
        },
        {
          id: "outstanding_invoice_count",
          label: "Outstanding invoices",
          description: "How many invoices still owe something right now.",
          unit: "count",
          emptyValue: "zero",
          dimensions: ["customer"],
          compare: false,
        },
      ],
      supportedCharts: ["kpi", "line", "bar", "table", "donut"],
      // Paid/Outstanding is mutually exclusive AND exhaustive over the scanned
      // invoices, so a COUNT by paid status sums to a meaningful whole.
      // Customer and currency are NOT part-to-whole: a customer breakdown is a
      // ranking, and a money-by-currency donut invites reading unrelated
      // currencies as shares of one pie.
      partToWholeDimensions: ["paid_status"],
      series: [
        // Explicit selection only — Top-N is deferred because an exact ranking
        // can't be promised once a scan is capped.
        { by: "customer", max: 8, modes: ["explicit"] },
        { by: "paid_status", max: 2, modes: [] },
      ],
      compare: true,
      queryLimits: {
        maxRangeDays: 366,
        maxBuckets: 400,
        maxCategoryRows: 50,
        maxRecordsScanned: QUICKBOOKS_SCAN_CAP,
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
      "Reconnect QuickBooks to keep using invoice data in Analytics.",
      "RECONNECT_REQUIRED",
    );
  }
  // The QuickBooks transport throws RateLimitedError for 429; match on the
  // class name so this module needn't import the provider's error module.
  const name = err instanceof Error ? err.constructor.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "RateLimitedError" || /rate.?limit|too many requests|\b429\b/i.test(message)) {
    return new ConnectedAnalyticsError(
      "QuickBooks is temporarily limiting requests. We'll use recent saved data when available.",
      "RATE_LIMITED",
    );
  }
  return new ConnectedAnalyticsError("Couldn't load QuickBooks data.", "PROVIDER_ERROR");
}

/** `YYYY-MM-DD` in UTC — the granularity QuickBooks' TxnDate predicate uses. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Opaque, per-account-stable customer key. QuickBooks customer ids never leave
 * the server: results and cached snapshots carry this hash instead, so a
 * stored chart holds no provider identifier. Salted with the account id, so
 * the same customer produces different keys in different accounts and a key
 * can't be correlated across accounts.
 */
function customerKeyFactory(accountId: string): (customerId: string) => string {
  return (customerId: string) =>
    createHash("sha256").update(`${accountId}:${customerId}`).digest("hex").slice(0, 16);
}

export const quickbooksInvoicesAdapter: AnalyticsDatasetAdapter = {
  sourceId: "quickbooks",
  datasetId: "invoices",
  // Server-side only — never in the client projection. This is the scope
  // QuickBooks is ALREADY connected with; CD-4B requests nothing new.
  requiredScopes: ["com.intuit.quickbooks.accounting"],
  async query(
    ctx: AnalyticsExecutionContext,
    query: ConnectedAnalyticsQuery,
  ): Promise<ConnectedAnalyticsResult> {
    const now = ctx.now ?? Date.now();
    // Account-class: the ACCOUNT's QuickBooks connection; never user-pinned,
    // and the realm comes from the stored row — never from the client.
    const integration = await getActiveForExecution(ctx.accountId, "quickbooks", null);
    if (!integration || !integration.providerAccountId) {
      throw new ConnectedAnalyticsError(
        "Connect QuickBooks to use invoice data in Analytics.",
        "MISSING_CREDENTIAL",
      );
    }
    const realmId = integration.providerAccountId;

    const { fromMs, toMs } = resolveQueryRange(query.range, now);
    const customerFilter = query.filters?.["customer"];
    const customerId =
      Array.isArray(customerFilter) && customerFilter.length === 1
        ? customerFilter[0]
        : undefined;
    const customerKeyOf = customerKeyFactory(ctx.accountId);

    // QuickBooks' TxnDate predicate is INCLUSIVE on both ends and day-grained,
    // while the platform window is [from, to). Asking for `<= to - 1ms`'s day
    // keeps the exclusive end honest; the aggregation re-applies the exact
    // [from, to) bound anyway.
    const windowOf = (aMs: number, bMs: number) => ({
      realmId,
      dateFrom: isoDate(aMs),
      dateTo: isoDate(bMs - 1),
      customerKeyOf,
      ...(customerId ? { customerId } : {}),
    });

    let scan: InvoiceScanResult;
    let prevScan: InvoiceScanResult | undefined;
    try {
      scan = await refreshAndRetry({
        accountId: ctx.accountId,
        provider: "quickbooks",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken: string) =>
          scanInvoiceWindow(accessToken, windowOf(fromMs, toMs)),
      });
      if (query.compare === "previous_period") {
        prevScan = await refreshAndRetry({
          accountId: ctx.accountId,
          provider: "quickbooks",
          providerAccountId: integration.providerAccountId,
          apiCall: (accessToken: string) =>
            scanInvoiceWindow(accessToken, windowOf(fromMs - (toMs - fromMs), fromMs)),
        });
      }
    } catch (err) {
      throw classify(err);
    }

    // The entity picker hands back REAL QuickBooks customer ids (that is what
    // the `quickbooks:customers` resolver lists). Facts carry opaque keys, so
    // an explicit customer series is translated into key-space here — the one
    // place that legitimately knows both — keeping the aggregation pure and
    // the emitted series ids free of provider identifiers.
    const aggregationQuery: ConnectedAnalyticsQuery =
      query.series?.by === "customer" && query.series.ids
        ? {
            ...query,
            series: { ...query.series, ids: query.series.ids.map(customerKeyOf) },
          }
        : query;

    return aggregateQuickbooksInvoices({
      query: aggregationQuery,
      facts: scan.facts,
      ...(prevScan ? { prevFacts: prevScan.facts } : {}),
      truncated: scan.truncated,
      ...(prevScan ? { prevTruncated: prevScan.truncated } : {}),
      malformed: scan.malformed + (prevScan?.malformed ?? 0),
      now,
      scanCap: QUICKBOOKS_SCAN_CAP,
    });
  },
};
