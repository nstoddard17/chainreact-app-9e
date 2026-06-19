/**
 * @jest-environment node
 *
 * Shopify analytics adapter (Slice ANALYTICS-SOURCES-SHOPIFY-1): account-shared
 * credential resolution (non-refreshable → refreshAndRetry, no per-user pin),
 * count/sum-only order metrics (counts + paid revenue via a bounded order-window
 * scan — never customer/email/line-item/address/order-id), dominant-currency
 * handling, and typed, leak-free error normalization. No network/DB — the credential
 * repo, refreshAndRetry, and the bounded reader are mocked.
 */

const mockGetIntegration = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  __esModule: true,
  getActiveForExecution: (...args: unknown[]) => mockGetIntegration(...args),
}));

const mockScan = jest.fn();
jest.mock("@/services/analytics/sources/shopify/api", () => {
  const actual = jest.requireActual("@/services/analytics/sources/shopify/api");
  return { ...actual, scanOrdersWindow: (...args: unknown[]) => mockScan(...args) };
});

const mockRefresh = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (input: unknown) => mockRefresh(input) };
});

import { shopifyAnalyticsSource } from "@/services/analytics/sources/shopify";
import { ShopifyRateLimitError } from "@/services/analytics/sources/shopify/api";
import {
  AnalyticsSourceError,
  NormalizedAnalyticsResultSchema,
} from "@/services/analytics/sources/types";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-04T00:00:00Z" }; // 4 day-buckets
const ms = (iso: string) => Date.parse(iso);

const ORDERS = [
  { createdMs: ms("2026-06-01T09:00:00Z"), amount: 100, status: "paid", currency: "usd" },
  { createdMs: ms("2026-06-02T09:00:00Z"), amount: 50, status: "paid", currency: "usd" },
  { createdMs: ms("2026-06-01T10:00:00Z"), amount: 25, status: "pending", currency: "usd" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntegration.mockResolvedValue({ providerAccountId: "demo.myshopify.com" });
  mockRefresh.mockImplementation((input: { apiCall: (t: string) => unknown }) => input.apiCall("tok"));
  mockScan.mockResolvedValue({ facts: ORDERS, truncated: false });
});

describe("metric registration", () => {
  it("exposes only the approved count/sum-only metric set; no metric takes a filter", () => {
    expect(shopifyAnalyticsSource.providerKey).toBe("shopify");
    expect(shopifyAnalyticsSource.connectedApp).toBe(true);
    expect(shopifyAnalyticsSource.metrics.map((m) => m.key).sort()).toEqual([
      "orders_count",
      "orders_over_time",
      "paid_orders_count",
      "revenue_over_time",
      "revenue_sum",
    ]);
    for (const m of shopifyAnalyticsSource.metrics) expect(m.supportedFilters).toEqual([]);
  });
});

describe("validation (no scan before it passes)", () => {
  it("rejects an unknown metric", async () => {
    await expect(
      shopifyAnalyticsSource.query({ metricKey: "list_customer_emails", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "UNKNOWN_METRIC" });
    expect(mockGetIntegration).not.toHaveBeenCalled();
  });

  it("rejects an inverted/invalid date range before any I/O", async () => {
    await expect(
      shopifyAnalyticsSource.query(
        { metricKey: "orders_count", range: { since: "2026-06-04T00:00:00Z", until: "2026-06-01T00:00:00Z" } },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(mockScan).not.toHaveBeenCalled();
  });
});

describe("credential resolution (account-shared — no per-user pin)", () => {
  it("resolves the account's Shopify store and runs the scan through refreshAndRetry", async () => {
    await shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX);
    expect(mockGetIntegration).toHaveBeenCalledWith("acct-1", "shopify", null);
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({
      accountId: "acct-1",
      provider: "shopify",
      providerAccountId: "demo.myshopify.com",
    });
  });

  it("returns MISSING_CREDENTIAL when the account has no Shopify connection", async () => {
    mockGetIntegration.mockResolvedValue(null);
    await expect(
      shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
    expect(mockScan).not.toHaveBeenCalled();
  });

  it("returns MISSING_CREDENTIAL when the store domain is missing", async () => {
    mockGetIntegration.mockResolvedValue({ providerAccountId: null });
    await expect(
      shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });
});

describe("metrics (counts + revenue)", () => {
  it("orders_count counts all orders in the window", async () => {
    const r = await shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX);
    expect(() => NormalizedAnalyticsResultSchema.parse(r)).not.toThrow();
    expect(r.totals).toEqual({ orders_count: 3 });
  });

  it("paid_orders_count counts only paid orders", async () => {
    const r = await shopifyAnalyticsSource.query({ metricKey: "paid_orders_count", range: RANGE }, CTX);
    expect(r.totals).toEqual({ paid_orders_count: 2 });
  });

  it("revenue_sum sums paid order totals (dominant currency)", async () => {
    const r = await shopifyAnalyticsSource.query({ metricKey: "revenue_sum", range: RANGE }, CTX);
    expect(r.totals).toEqual({ revenue_sum: 150 });
  });

  it("orders_over_time buckets all orders by created time", async () => {
    const r = await shopifyAnalyticsSource.query({ metricKey: "orders_over_time", range: RANGE }, CTX);
    expect(r.shape).toBe("series");
    expect(r.rows).toHaveLength(4);
    expect(r.rows.map((row) => row.count)).toEqual([2, 1, 0, 0]); // 06-01 ×2, 06-02 ×1
    expect(r.totals?.count).toBe(3);
  });

  it("revenue_over_time buckets paid revenue by created time", async () => {
    const r = await shopifyAnalyticsSource.query({ metricKey: "revenue_over_time", range: RANGE }, CTX);
    expect(r.rows.map((row) => row.count)).toEqual([100, 50, 0, 0]); // pending 25 excluded
    expect(r.totals?.count).toBe(150);
  });

  it("revenue_sum sums only the dominant currency and warns when others are excluded", async () => {
    mockScan.mockResolvedValue({
      facts: [
        { createdMs: ms("2026-06-01T09:00:00Z"), amount: 100, status: "paid", currency: "usd" },
        { createdMs: ms("2026-06-02T09:00:00Z"), amount: 50, status: "paid", currency: "usd" },
        { createdMs: ms("2026-06-03T09:00:00Z"), amount: 999, status: "paid", currency: "eur" },
      ],
      truncated: false,
    });
    const r = await shopifyAnalyticsSource.query({ metricKey: "revenue_sum", range: RANGE }, CTX);
    expect(r.totals).toEqual({ revenue_sum: 150 }); // EUR excluded
    // Warning names the dominant (kept) currency + flags that others were excluded.
    expect(r.warnings.some((w) => /USD/.test(w) && /other currencies/i.test(w))).toBe(true);
  });

  it("surfaces a truncation warning when the order scan hit the cap", async () => {
    mockScan.mockResolvedValue({ facts: ORDERS, truncated: true });
    const r = await shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX);
    expect(r.truncated).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never surfaces customer / order detail — only counts, revenue, and dates", async () => {
    const r = await shopifyAnalyticsSource.query({ metricKey: "orders_over_time", range: RANGE }, CTX);
    expect(JSON.stringify(r)).not.toMatch(/email|customer|line_item|address|note|order_number|@|"id"/i);
  });
});

describe("error normalization (typed, leak-free)", () => {
  it("IntegrationActionRequiredError → MISSING_CREDENTIAL (reconnect)", async () => {
    mockRefresh.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "shopify",
        providerAccountId: "demo.myshopify.com",
        reason: "refresh_not_supported",
      }),
    );
    await expect(
      shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a leaked 401 → MISSING_CREDENTIAL", async () => {
    mockScan.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("a 429 → RATE_LIMITED", async () => {
    mockScan.mockRejectedValueOnce(new ShopifyRateLimitError("rate-limited"));
    await expect(
      shopifyAnalyticsSource.query({ metricKey: "orders_count", range: RANGE }, CTX),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("an unexpected error → generic PROVIDER_ERROR with no raw leak", async () => {
    mockScan.mockRejectedValueOnce(new Error("secret-internal token=abc123 boom"));
    const err = await shopifyAnalyticsSource
      .query({ metricKey: "orders_count", range: RANGE }, CTX)
      .catch((e) => e);
    expect(err).toBeInstanceOf(AnalyticsSourceError);
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/secret-internal|token=abc123/);
  });
});
