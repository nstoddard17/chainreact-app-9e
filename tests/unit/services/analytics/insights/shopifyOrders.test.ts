/**
 * ANALYTICS-CONNECTED-DATA-CD-4C — Shopify Orders dataset: catalog, money,
 * status normalization, test-order default, aggregation semantics, and adapter
 * behaviour.
 *
 * Mocks sit at the TRUE Shopify HTTP boundary only (global fetch, since the
 * insights scanner reads the Link header directly) plus the oauth/repo seams.
 * Everything between is real: the scanner builds the actual URLs, pages the
 * actual cursors, and the real aggregation runs. Fixtures mirror the wire
 * shapes observed during the CD-4C Phase A live certification (decimal-string
 * totals, ISO currency, boolean test, null-or-ISO cancelled_at).
 */
import { ConnectedAnalyticsQuerySchema } from "@/contracts/connectedAnalytics";

const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("tok_test"),
  };
});

import {
  MIXED_CURRENCY_MESSAGE,
  MISSING_CURRENCY_WARNING,
  aggregateShopifyOrders,
  normalizeFinancialStatus,
  normalizeFulfillmentStatus,
} from "@/services/analytics/insights/shopify/aggregate";
import {
  SHOPIFY_SCAN_CAP,
  shopifyOrdersAdapter,
} from "@/services/analytics/insights/shopify";
import { getInsightDataset } from "@/services/analytics/insights/registry";
import { buildClientAnalyticsCatalog } from "@/services/analytics/insights/clientProjection";
import { validateConnectedQuery } from "@/services/analytics/insights/validateQuery";
import {
  INSIGHT_PAGE_SIZE,
  type ShopifyOrderFact,
} from "@/services/analytics/sources/shopify/insightOrders";
import { ShopifyRateLimitError } from "@/services/analytics/sources/shopify/api";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const CTX = { accountId: "acct-1", userId: "u1", now: NOW };
const FROM = "2026-07-01T00:00:00.000Z";
const TO = "2026-07-05T00:00:00.000Z";

const q = (body: Record<string, unknown>) =>
  ConnectedAnalyticsQuerySchema.parse({
    source: "shopify",
    dataset: "orders",
    range: { from: FROM, to: TO },
    ...body,
  });

/** A transient order fact (minor units, as the scanner produces them). */
const fact = (
  createdIso: string | null,
  totalMinor: number | null,
  extra: Partial<ShopifyOrderFact> = {},
): ShopifyOrderFact => ({
  createdMs: createdIso ? Date.parse(createdIso) : null,
  totalMinor,
  currency: "usd",
  financialStatus: "paid",
  fulfillmentStatus: null,
  cancelled: false,
  test: false,
  ...extra,
});

const agg = (
  body: Record<string, unknown>,
  facts: ShopifyOrderFact[],
  extra: Partial<Parameters<typeof aggregateShopifyOrders>[0]> = {},
) =>
  aggregateShopifyOrders({
    query: q(body),
    facts,
    truncated: false,
    now: NOW,
    scanCap: SHOPIFY_SCAN_CAP,
    ...extra,
  });

/** Raw Shopify wire order — the shape the scanner's projection consumes. */
function wire(
  id: number,
  createdAt: string,
  totalPrice: string,
  opts: {
    currency?: string;
    financial?: string | null;
    fulfillment?: string | null;
    cancelledAt?: string | null;
    test?: boolean;
  } = {},
): Record<string, unknown> {
  return {
    id,
    created_at: createdAt,
    updated_at: createdAt,
    cancelled_at: opts.cancelledAt ?? null,
    total_price: totalPrice,
    currency: opts.currency ?? "USD",
    financial_status: opts.financial === undefined ? "paid" : opts.financial,
    fulfillment_status: opts.fulfillment === undefined ? null : opts.fulfillment,
    test: opts.test ?? false,
    // Fields the scanner must NEVER read into a fact:
    email: "buyer@example.test",
    note: "gift wrap please",
    customer: { id: 999, email: "buyer@example.test", first_name: "Ada" },
    line_items: [{ title: "Blue Widget", price: totalPrice }],
    discount_codes: [{ code: "SECRET10" }],
  };
}

/** Serve pages of `rows` through a realistic orders.json + Link header. */
function armShopify(rows: Record<string, unknown>[], pageSize = INSIGHT_PAGE_SIZE): void {
  globalThis.fetch = jest.fn(async (rawUrl: string) => {
    const url = new URL(String(rawUrl));
    const limit = Number(url.searchParams.get("limit") ?? pageSize);
    const cursor = Number(url.searchParams.get("page_info") ?? "0");
    const min = url.searchParams.get("created_at_min");
    const max = url.searchParams.get("created_at_max");
    let filtered = rows;
    if (min) filtered = filtered.filter((r) => Date.parse(String(r.created_at)) >= Date.parse(min));
    if (max) filtered = filtered.filter((r) => Date.parse(String(r.created_at)) <= Date.parse(max));
    // page_info supersedes filters (as in the real API, the cursor carries them).
    const source = url.searchParams.has("page_info") ? rows : filtered;
    const slice = source.slice(cursor, cursor + limit);
    const nextStart = cursor + limit;
    const hasNext = nextStart < source.length;
    return {
      ok: true,
      status: 200,
      headers: new Headers(
        hasNext
          ? { link: `<https://x.myshopify.com/admin/api/2024-10/orders.json?page_info=${nextStart}&limit=${limit}>; rel="next"` }
          : {},
      ),
      json: async () => ({ orders: slice }),
      text: async () => "",
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset().mockResolvedValue({
    accountId: "acct-1",
    providerAccountId: "certstore.myshopify.com",
  });
  armShopify([]);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("catalog registration", () => {
  const reg = getInsightDataset("shopify", "orders")!;

  it("registers shopify.orders as an account-class provider snapshot, public", () => {
    expect(reg).toBeTruthy();
    expect(reg.catalog.source.credentialMode).toBe("account");
    expect(reg.catalog.source.connectionRequired).toBe(true);
    expect(reg.catalog.source.exposure).toBe("public");
    expect(reg.dataset.executionMode).toBe("provider_snapshot");
    expect(reg.dataset.freshness).toEqual({ mode: "cached", ttlSeconds: 600 });
    expect(reg.dataset.queryLimits.maxRangeDays).toBe(366);
    expect(reg.dataset.queryLimits.maxRecordsScanned).toBe(2500);
  });

  it("exposes exactly the four approved measures", () => {
    expect(reg.capabilities.measures.map((m) => m.id).sort()).toEqual([
      "avg_order_amount",
      "order_count",
      "paid_order_count",
      "total_order_amount",
    ]);
  });

  it("never calls order totals revenue, net sales, payouts or profit", () => {
    const text = JSON.stringify(reg.dataset.namedMeasures).toLowerCase();
    for (const banned of ["revenue", "net sales", "payout", "profit", "cash collected"]) {
      // The words appear only inside explicit negations ("Not net sales…").
      const label = reg.capabilities.measures.map((m) => m.label.toLowerCase()).join(" ");
      expect(label).not.toContain(banned);
    }
    expect(text).toContain("not net sales");
  });

  it("treats the order identifier as identifier-only", () => {
    const field = reg.dataset.fields.find((f) => f.id === "order_id")!;
    expect(field.kind).toBe("text");
    expect(reg.capabilities.measures.some((m) => m.id.includes("order_id"))).toBe(false);
    expect(reg.capabilities.dimensions.some((d) => d.id === "order_id")).toBe(false);
    expect(reg.capabilities.filters.some((f) => f.id === "order_id")).toBe(false);
  });

  it("declares the normalized bounded status domains", () => {
    const fin = reg.dataset.fields.find((f) => f.id === "financial_status")!;
    expect(fin.values!.map((v) => v.id)).toEqual([
      "paid", "pending", "authorized", "partially_paid", "partially_refunded",
      "refunded", "voided", "unknown",
    ]);
    const ful = reg.dataset.fields.find((f) => f.id === "fulfillment_status")!;
    expect(ful.values!.map((v) => v.id)).toEqual([
      "unfulfilled", "partial", "fulfilled", "restocked", "unknown",
    ]);
    expect(ful.values!.find((v) => v.id === "unfulfilled")!.label).toBe("Unfulfilled");
  });

  it("declares the test-order toggle as a boolean filter, never a dimension", () => {
    const f = reg.capabilities.filters.find((x) => x.id === "include_test_orders")!;
    expect(f.valueType).toBe("boolean");
    expect(f.label).toBe("Include test orders");
    expect(reg.capabilities.dimensions.some((d) => d.id === "include_test_orders")).toBe(false);
  });

  it("offers the certified dimensions and filters", () => {
    expect(reg.capabilities.dimensions.map((d) => d.id).sort()).toEqual([
      "cancellation_state", "currency", "financial_status", "fulfillment_status", "time",
    ]);
    expect(reg.capabilities.filters.map((f) => f.id).sort()).toEqual([
      "cancellation_state", "currency", "financial_status", "fulfillment_status",
      "include_test_orders",
    ]);
  });

  it("declares part-to-whole for the two partitioning status domains only", () => {
    expect(reg.dataset.partToWholeDimensions).toEqual([
      "financial_status",
      "fulfillment_status",
    ]);
  });

  it("bounds series at the domain sizes with automatic keys", () => {
    expect(reg.dataset.series).toEqual([
      { by: "financial_status", max: 8, modes: [] },
      { by: "fulfillment_status", max: 5, modes: [] },
    ]);
  });

  it("keeps money to the time dimension — statuses stay filters for money", () => {
    const money = reg.capabilities.measures.find((m) => m.id === "total_order_amount")!;
    expect(money.dimensions).toEqual(["time"]);
    expect(() =>
      validateConnectedQuery(reg, q({ measure: "total_order_amount", dimension: "financial_status" })),
    ).toThrow(/can't be grouped that way/i);
    // …but a paid-only filter on money is the supported path.
    expect(() =>
      validateConnectedQuery(
        reg,
        q({ measure: "total_order_amount", dimension: null, filters: { financial_status: ["paid"] } }),
      ),
    ).not.toThrow();
  });

  it("restricts paid order count from a contradictory financial-status filter", () => {
    expect(() =>
      validateConnectedQuery(
        reg,
        q({ measure: "paid_order_count", dimension: null, filters: { financial_status: ["refunded"] } }),
      ),
    ).toThrow(/doesn't apply/i);
  });

  it("allows a donut only for count breakdowns of the declared partitions", () => {
    expect(() =>
      validateConnectedQuery(reg, q({ measure: "order_count", dimension: "financial_status", chart: "donut" })),
    ).not.toThrow();
    expect(() =>
      validateConnectedQuery(reg, q({ measure: "order_count", dimension: "fulfillment_status", chart: "donut" })),
    ).not.toThrow();
    expect(() =>
      validateConnectedQuery(reg, q({ measure: "order_count", dimension: "cancellation_state", chart: "donut" })),
    ).toThrow(/part-to-whole/i);
    expect(() =>
      validateConnectedQuery(reg, q({ measure: "total_order_amount", dimension: "financial_status", chart: "donut" })),
    ).toThrow();
  });

  it("client projection lists Shopify and leaks no scopes or server internals", () => {
    const catalog = buildClientAnalyticsCatalog({ environment: "production" });
    const shopify = catalog.sources.find((s) => s.id === "shopify")!;
    expect(shopify).toBeTruthy();
    expect(shopify.datasets.find((d) => d.id === "orders")).toBeTruthy();
    const json = JSON.stringify(catalog);
    for (const leak of ["read_orders", "myshopify", "provider_snapshot", "page_info", "created_at_min"]) {
      expect(json).not.toContain(leak);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("status normalization", () => {
  it.each([
    ["paid", "paid"], ["pending", "pending"], ["authorized", "authorized"],
    ["partially_paid", "partially_paid"], ["partially_refunded", "partially_refunded"],
    ["refunded", "refunded"], ["voided", "voided"],
    [null, "unknown"], ["surprise_status", "unknown"],
  ])("financial %p → %s", (raw, expected) => {
    expect(normalizeFinancialStatus(raw as string | null)).toBe(expected);
  });

  it.each([
    [null, "unfulfilled"], ["fulfilled", "fulfilled"], ["partial", "partial"],
    ["restocked", "restocked"], ["on_hold", "unknown"],
  ])("fulfillment %p → %s", (raw, expected) => {
    expect(normalizeFulfillmentStatus(raw as string | null)).toBe(expected);
  });

  it("partitions every order into exactly one value of each domain", () => {
    const facts = [
      fact("2026-07-02T10:00:00Z", 100),
      fact("2026-07-02T10:00:00Z", 100, { financialStatus: null, fulfillmentStatus: "weird" }),
      fact("2026-07-02T10:00:00Z", 100, { financialStatus: "refunded", fulfillmentStatus: "partial" }),
    ];
    const finRows = agg({ measure: "order_count", dimension: "financial_status" }, facts).rows!;
    expect(finRows.reduce((s, r) => s + (r.value ?? 0), 0)).toBe(3);
    const fulRows = agg({ measure: "order_count", dimension: "fulfillment_status" }, facts).rows!;
    expect(fulRows.reduce((s, r) => s + (r.value ?? 0), 0)).toBe(3);
  });

  it("labels missing fulfillment explicitly as Unfulfilled, not null noise", () => {
    const rows = agg({ measure: "order_count", dimension: "fulfillment_status" }, [
      fact("2026-07-02T10:00:00Z", 100, { fulfillmentStatus: null }),
    ]).rows!;
    expect(rows).toEqual([
      { id: "unfulfilled", label: "Unfulfilled", value: 1, records: 1 },
    ]);
  });

  it("refunded/partially refunded states never invent refund amounts", () => {
    // Money still sums the ORDER TOTAL — refunds are not subtracted, which is
    // exactly what the measure description promises.
    const facts = [
      fact("2026-07-02T10:00:00Z", 10000, { financialStatus: "refunded" }),
      fact("2026-07-02T10:00:00Z", 5000, { financialStatus: "partially_refunded" }),
    ];
    expect(agg({ measure: "total_order_amount", dimension: null }, facts).value).toBe(150);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("test-order default", () => {
  const facts = [
    fact("2026-07-02T10:00:00Z", 10000),
    fact("2026-07-02T11:00:00Z", 99900, { test: true }),
  ];

  it("excludes test orders from every measure by default", () => {
    expect(agg({ measure: "order_count", dimension: null }, facts).value).toBe(1);
    expect(agg({ measure: "total_order_amount", dimension: null }, facts).value).toBe(100);
  });

  it("treats an explicit false the same as the default", () => {
    expect(
      agg({ measure: "order_count", dimension: null, filters: { include_test_orders: false } }, facts).value,
    ).toBe(1);
  });

  it("includes test orders only on a literal true", () => {
    expect(
      agg({ measure: "order_count", dimension: null, filters: { include_test_orders: true } }, facts).value,
    ).toBe(2);
    expect(
      agg({ measure: "total_order_amount", dimension: null, filters: { include_test_orders: true } }, facts).value,
    ).toBe(1099);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("money and currency", () => {
  it("sums decimal-string-derived minor units without float drift", () => {
    const facts = [fact("2026-07-02T10:00:00Z", 10), fact("2026-07-02T10:00:00Z", 20)];
    const r = agg({ measure: "total_order_amount", dimension: null }, facts);
    expect(r.value).toBe(0.3);
    expect(r.valueMeta).toEqual({ unit: "currency", currency: "USD" });
  });

  it("keeps a large 2,500-order total exact", () => {
    const facts = Array.from({ length: 2500 }, () => fact("2026-07-02T10:00:00Z", 36207));
    expect(agg({ measure: "total_order_amount", dimension: null }, facts).value).toBe(905175);
  });

  it("averages only orders with readable amounts and rounds to the currency", () => {
    const facts = [
      fact("2026-07-02T10:00:00Z", 10000),
      fact("2026-07-02T10:00:00Z", 5001),
      fact("2026-07-02T10:00:00Z", null), // unreadable — not a denominator
    ];
    expect(agg({ measure: "avg_order_amount", dimension: null }, facts).value).toBe(75.01);
  });

  it("returns null for an average over nothing, zero for an empty sum/count", () => {
    expect(agg({ measure: "avg_order_amount", dimension: null }, []).value).toBeNull();
    expect(agg({ measure: "total_order_amount", dimension: null }, []).value).toBe(0);
    expect(agg({ measure: "order_count", dimension: null }, []).value).toBe(0);
  });

  it("rejects a monetary measure spanning more than one currency", () => {
    const facts = [
      fact("2026-07-02T10:00:00Z", 10000),
      fact("2026-07-02T10:00:00Z", 9900, { currency: "eur" }),
    ];
    expect(() => agg({ measure: "total_order_amount", dimension: null }, facts)).toThrow(
      MIXED_CURRENCY_MESSAGE,
    );
  });

  it("resolves mixed currencies through an explicit currency filter", () => {
    const facts = [
      fact("2026-07-02T10:00:00Z", 10000),
      fact("2026-07-02T10:00:00Z", 9900, { currency: "eur" }),
    ];
    const r = agg(
      { measure: "total_order_amount", dimension: null, filters: { currency: ["eur"] } },
      facts,
    );
    expect(r.value).toBe(99);
    expect(r.valueMeta.currency).toBe("EUR");
  });

  it("leaves counts currency-independent and groupable by currency", () => {
    const facts = [
      fact("2026-07-02T10:00:00Z", 10000),
      fact("2026-07-02T10:00:00Z", 9900, { currency: "eur" }),
    ];
    expect(agg({ measure: "order_count", dimension: null }, facts).value).toBe(2);
    const rows = agg({ measure: "order_count", dimension: "currency" }, facts).rows!;
    expect(rows.map((r) => r.label).sort()).toEqual(["EUR", "USD"]);
  });

  it("never assumes USD when Shopify reports no currency", () => {
    const facts = [fact("2026-07-02T10:00:00Z", 10000, { currency: null })];
    const r = agg({ measure: "total_order_amount", dimension: null }, facts);
    expect(r.value).toBe(100);
    expect(r.valueMeta.currency).toBeUndefined();
    expect(r.warnings).toContain(MISSING_CURRENCY_WARNING);
  });

  it("requires compatible currencies across a comparison window", () => {
    expect(() =>
      agg(
        { measure: "total_order_amount", dimension: null, compare: "previous_period" },
        [fact("2026-07-02T10:00:00Z", 10000)],
        { prevFacts: [fact("2026-06-28T10:00:00Z", 9900, { currency: "eur" })] },
      ),
    ).toThrow(MIXED_CURRENCY_MESSAGE);
  });

  it("warns about unreadable totals only on money measures", () => {
    const facts = [fact("2026-07-02T10:00:00Z", 100)];
    const money = agg({ measure: "total_order_amount", dimension: null }, facts, {
      malformedAmounts: 2,
    });
    expect(money.warnings.join(" ")).toMatch(/2 orders had an unreadable total/);
    const count = agg({ measure: "order_count", dimension: null }, facts, {
      malformedAmounts: 2,
    });
    expect(count.warnings).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("measure semantics", () => {
  const facts = [
    fact("2026-07-01T09:00:00Z", 10000, { financialStatus: "paid" }),
    fact("2026-07-02T09:00:00Z", 25000, { financialStatus: "pending" }),
    fact("2026-07-03T09:00:00Z", 5000, { financialStatus: "paid", cancelled: true }),
  ];

  it("order count counts every matching order, cancelled included by default", () => {
    expect(agg({ measure: "order_count", dimension: null }, facts).value).toBe(3);
  });

  it("paid order count is exactly the paid status — nothing broader", () => {
    expect(agg({ measure: "paid_order_count", dimension: null }, facts).value).toBe(2);
    const broader = [
      ...facts,
      fact("2026-07-02T10:00:00Z", 100, { financialStatus: "partially_paid" }),
      fact("2026-07-02T10:00:00Z", 100, { financialStatus: "authorized" }),
    ];
    expect(agg({ measure: "paid_order_count", dimension: null }, broader).value).toBe(2);
  });

  it("total order amount sums checkout totals of ALL matching orders", () => {
    expect(agg({ measure: "total_order_amount", dimension: null }, facts).value).toBe(400);
  });

  it("cancellation is filterable, derived from cancelled_at, not from status", () => {
    expect(
      agg(
        { measure: "total_order_amount", dimension: null, filters: { cancellation_state: ["active"] } },
        facts,
      ).value,
    ).toBe(350);
    const rows = agg({ measure: "order_count", dimension: "cancellation_state" }, facts).rows!;
    expect(rows.map((r) => `${r.label}=${r.value}`).sort()).toEqual(["Active=2", "Cancelled=1"]);
  });

  it("applies the [from, to) window bound exactly", () => {
    const boundary = [
      fact("2026-06-30T23:59:59Z", 100),
      fact("2026-07-01T00:00:00Z", 100), // from — included
      fact("2026-07-05T00:00:00Z", 100), // to — excluded
    ];
    expect(agg({ measure: "order_count", dimension: null }, boundary).value).toBe(1);
  });

  it("ignores orders with an unparseable created time", () => {
    expect(agg({ measure: "order_count", dimension: null }, [fact(null, 100)]).value).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("time grouping and series", () => {
  const spread = [
    fact("2026-07-01T09:00:00Z", 10000, { financialStatus: "paid" }),
    fact("2026-07-01T10:00:00Z", 5000, { financialStatus: "pending" }),
    fact("2026-07-03T09:00:00Z", 20000, { financialStatus: "paid" }),
  ];

  it("zero-fills empty day buckets for a count", () => {
    const r = agg({ measure: "order_count", dimension: "time", timeGrain: "day" }, spread);
    expect(r.buckets!.map((b) => b.label)).toEqual([
      "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04",
    ]);
    expect(r.series![0]!.values).toEqual([2, 0, 1, 0]);
  });

  it.each([["week", "2026-06-29"], ["month", "2026-07-01"]])(
    "supports the %s grain",
    (grain, firstBucket) => {
      const r = agg({ measure: "order_count", dimension: "time", timeGrain: grain }, spread);
      expect(r.grain).toBe(grain);
      expect(r.buckets![0]!.label).toBe(firstBucket);
    },
  );

  it("splits count lines by financial status, observed statuses only, canonical order", () => {
    const r = agg(
      { measure: "order_count", dimension: "time", timeGrain: "day", series: { by: "financial_status" } },
      spread,
    );
    expect(r.series!.map((s) => s.id)).toEqual(["paid", "pending"]);
    expect(r.series!.map((s) => s.label)).toEqual(["Paid", "Pending"]);
    expect(r.series![0]!.values).toEqual([1, 0, 1, 0]);
    expect(r.series![1]!.values).toEqual([1, 0, 0, 0]);
  });

  it("splits count lines by fulfillment status", () => {
    const facts = [
      fact("2026-07-01T09:00:00Z", 100, { fulfillmentStatus: "fulfilled" }),
      fact("2026-07-02T09:00:00Z", 100, { fulfillmentStatus: null }),
    ];
    const r = agg(
      { measure: "order_count", dimension: "time", timeGrain: "day", series: { by: "fulfillment_status" } },
      facts,
    );
    expect(r.series!.map((s) => s.label)).toEqual(["Unfulfilled", "Fulfilled"]);
  });

  it("a status filter narrows the series keys", () => {
    const r = agg(
      {
        measure: "order_count",
        dimension: "time",
        timeGrain: "day",
        filters: { financial_status: ["paid"] },
        series: { by: "financial_status" },
      },
      spread,
    );
    expect(r.series!.map((s) => s.id)).toEqual(["paid"]);
  });

  it("caps series keys at the domain size (never more than 8)", () => {
    const everyStatus = [
      "paid", "pending", "authorized", "partially_paid", "partially_refunded",
      "refunded", "voided", null,
    ].map((s, i) =>
      fact(`2026-07-0${(i % 4) + 1}T09:00:00Z`, 100, { financialStatus: s as string | null }),
    );
    const r = agg(
      { measure: "order_count", dimension: "time", timeGrain: "day", series: { by: "financial_status" } },
      everyStatus,
    );
    expect(r.series!.length).toBe(8);
    expect(r.series!.map((s) => s.id)).toEqual([
      "paid", "pending", "authorized", "partially_paid", "partially_refunded",
      "refunded", "voided", "unknown",
    ]);
  });

  it("compares against the previous equal window", () => {
    const r = agg(
      { measure: "order_count", dimension: null, compare: "previous_period" },
      spread,
      { prevFacts: [fact("2026-06-28T10:00:00Z", 100)] },
    );
    expect(r.value).toBe(3);
    expect(r.compare).toMatchObject({
      previousValue: 1,
      previousRange: { from: "2026-06-27T00:00:00.000Z", to: "2026-07-01T00:00:00.000Z" },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("adapter against the mocked Shopify boundary", () => {
  it("resolves the account's shop and pushes created-time bounds server-side", async () => {
    armShopify([wire(1, "2026-07-02T10:00:00Z", "100.00")]);
    const r = await shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null }));
    expect(r.value).toBe(1);
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("acct-1", "shopify", null);
    const url = new URL((globalThis.fetch as jest.Mock).mock.calls[0]![0] as string);
    expect(url.hostname).toBe("certstore.myshopify.com");
    expect(url.searchParams.get("created_at_min")).toBe("2026-07-01T00:00:00.000Z");
    // [from, to) → the inclusive Shopify upper bound is to − 1ms.
    expect(url.searchParams.get("created_at_max")).toBe("2026-07-04T23:59:59.999Z");
    expect(url.searchParams.get("order")).toBe("created_at desc");
    expect(url.searchParams.get("status")).toBe("any");
  });

  it("requests only the certified fact fields — no customer/line-item fields", async () => {
    armShopify([wire(1, "2026-07-02T10:00:00Z", "100.00")]);
    await shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null }));
    const url = new URL((globalThis.fetch as jest.Mock).mock.calls[0]![0] as string);
    expect(url.searchParams.get("fields")).toBe(
      "created_at,total_price,currency,financial_status,fulfillment_status,cancelled_at,test",
    );
  });

  it("reads decimal-string totals into exact sums", async () => {
    armShopify([
      wire(1, "2026-07-02T10:00:00Z", "362.07"),
      wire(2, "2026-07-02T11:00:00Z", "0.10"),
      wire(3, "2026-07-02T12:00:00Z", "0.20"),
    ]);
    const r = await shopifyOrdersAdapter.query(
      CTX,
      q({ measure: "total_order_amount", dimension: null }),
    );
    expect(r.value).toBe(362.37);
  });

  it("pages through the cursor until the link header runs out", async () => {
    const rows = Array.from({ length: INSIGHT_PAGE_SIZE + 20 }, (_, i) =>
      wire(i + 1, "2026-07-02T10:00:00Z", "10.00"),
    );
    armShopify(rows);
    const r = await shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null }));
    expect(r.value).toBe(INSIGHT_PAGE_SIZE + 20);
    expect(r.completeness.state).toBe("complete");
    const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => new URL(String(c[0])));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.searchParams.get("page_info")).toBe(String(INSIGHT_PAGE_SIZE));
    // Follow-up pages carry ONLY limit/page_info/fields.
    expect(calls[1]!.searchParams.has("created_at_min")).toBe(false);
    expect(calls[1]!.searchParams.has("status")).toBe(false);
    expect(calls[1]!.searchParams.has("order")).toBe(false);
  });

  it("stops at the cap and reports scan_capped instead of truncating silently", async () => {
    const rows = Array.from({ length: SHOPIFY_SCAN_CAP + 1 }, (_, i) =>
      wire(i + 1, "2026-07-02T10:00:00Z", "10.00"),
    );
    armShopify(rows);
    const r = await shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null }));
    expect(r.value).toBe(SHOPIFY_SCAN_CAP);
    expect(r.completeness).toEqual({
      state: "scan_capped",
      detail: expect.stringContaining("2500"),
    });
    expect(r.warnings.join(" ")).toMatch(/most recently placed/i);
    expect((globalThis.fetch as jest.Mock).mock.calls).toHaveLength(10);
  });

  it("scans a second window for a period comparison", async () => {
    armShopify([wire(1, "2026-07-02T10:00:00Z", "100.00")]);
    await shopifyOrdersAdapter.query(
      CTX,
      q({ measure: "order_count", dimension: null, compare: "previous_period" }),
    );
    const calls = (globalThis.fetch as jest.Mock).mock.calls.map((c) => new URL(String(c[0])));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.searchParams.get("created_at_min")).toBe("2026-06-27T00:00:00.000Z");
    expect(calls[1]!.searchParams.get("created_at_max")).toBe("2026-06-30T23:59:59.999Z");
  });

  it("handles an empty store without error", async () => {
    armShopify([]);
    const r = await shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null }));
    expect(r.value).toBe(0);
    expect(r.completeness.state).toBe("complete");
    expect(r.warnings).toEqual([]);
  });

  it("never emits customer, product, note, discount or id data", async () => {
    armShopify([
      wire(1, "2026-07-02T10:00:00Z", "100.00", { fulfillment: "fulfilled" }),
      wire(2, "2026-07-03T10:00:00Z", "50.00", { cancelledAt: "2026-07-04T00:00:00Z" }),
    ]);
    const r = await shopifyOrdersAdapter.query(
      CTX,
      q({ measure: "order_count", dimension: "fulfillment_status" }),
    );
    const json = JSON.stringify(r);
    for (const leak of [
      "buyer@example.test", "Blue Widget", "SECRET10", "gift wrap", "Ada",
      "certstore", "tok_test", "\"id\":1,", "\"id\":2,",
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it("asks the caller to connect Shopify when no integration exists", async () => {
    mockGetActiveForExecution.mockResolvedValue(null);
    await expect(
      shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null })),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("maps a 401 to RECONNECT_REQUIRED", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Unauthorized401Error("shopify");
    }) as unknown as typeof fetch;
    await expect(
      shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null })),
    ).rejects.toMatchObject({ code: "RECONNECT_REQUIRED" });
  });

  it("maps a Shopify 429 to RATE_LIMITED", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new ShopifyRateLimitError("429");
    }) as unknown as typeof fetch;
    await expect(
      shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null })),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps an unexpected failure to a safe PROVIDER_ERROR", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error("raw shopify body with shop domain certstore.myshopify.com");
    }) as unknown as typeof fetch;
    await expect(
      shopifyOrdersAdapter.query(CTX, q({ measure: "order_count", dimension: null })),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR", message: "Couldn't load Shopify data." });
  });

  it("counts malformed totals from the scan and surfaces them on money", async () => {
    armShopify([
      wire(1, "2026-07-02T10:00:00Z", "100.00"),
      wire(2, "2026-07-02T11:00:00Z", "not-a-number"),
    ]);
    const r = await shopifyOrdersAdapter.query(
      CTX,
      q({ measure: "total_order_amount", dimension: null }),
    );
    expect(r.value).toBe(100);
    expect(r.warnings.join(" ")).toMatch(/1 order had an unreadable total/);
  });
});
