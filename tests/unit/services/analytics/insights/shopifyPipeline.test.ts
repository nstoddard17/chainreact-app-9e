/**
 * ANALYTICS-CONNECTED-DATA-CD-4C — Shopify Orders through the CD-2 provider
 * pipeline: snapshot cache, in-flight coalescing, protective limiter, stale
 * fallback, and account isolation. Driven end-to-end through
 * runConnectedAnalyticsQuery with the REAL adapter; mocks sit at the repo and
 * Shopify HTTP boundaries only.
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
const mockGetByCacheKey = jest.fn();
const mockUpsert = jest.fn();
jest.mock("@/repositories/analyticsSourceSnapshots", () => ({
  getByCacheKey: (...args: unknown[]) => mockGetByCacheKey(...args),
  upsertServiceRole: (...args: unknown[]) => mockUpsert(...args),
}));
const mockIncrement = jest.fn();
jest.mock("@/repositories/analytics/providerRateLimits", () => ({
  incrementProviderRateBuckets: (...args: unknown[]) => mockIncrement(...args),
}));

import { runConnectedAnalyticsQuery } from "@/services/analytics/insights/runConnectedQuery";
import { buildInsightsCacheKey } from "@/services/analytics/insights/cache";
import { __resetInflightForTesting } from "@/services/analytics/insights/coalesce";
import { INSIGHTS_SOURCE_LIMIT_PER_WINDOW } from "@/core/analytics/insightsRateLimitPolicy";
import { ShopifyRateLimitError } from "@/services/analytics/sources/shopify/api";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const CTX = { accountId: "acct-1", userId: "u1", now: NOW };
const QUERY = ConnectedAnalyticsQuerySchema.parse({
  source: "shopify",
  dataset: "orders",
  measure: "order_count",
  dimension: null,
  range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-05T00:00:00.000Z" },
});

function armProvider(count = 1): void {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({}),
    json: async () => ({
      orders: Array.from({ length: count }, () => ({
        created_at: "2026-07-02T10:00:00Z",
        total_price: "100.00",
        currency: "USD",
        financial_status: "paid",
        fulfillment_status: null,
        cancelled_at: null,
        test: false,
      })),
    }),
    text: async () => "",
  })) as unknown as typeof fetch;
}

const snapshot = (value: number, expired: boolean) => ({
  result: {
    kind: "kpi",
    source: {
      sourceId: "shopify", sourceLabel: "Shopify",
      datasetId: "orders", datasetLabel: "Orders",
    },
    measure: { id: "order_count", label: "Order count" },
    dimension: null,
    grain: null,
    range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-05T00:00:00.000Z" },
    valueMeta: { unit: "count" },
    freshness: { mode: "cached", ageSeconds: 0, ttlSeconds: 600 },
    completeness: { state: "complete" },
    value,
    compare: null,
    warnings: [],
  },
  generatedAt: new Date(NOW - 3_600_000).toISOString(),
  expiresAt: new Date(expired ? NOW - 60_000 : NOW + 60_000).toISOString(),
});

beforeEach(() => {
  __resetInflightForTesting();
  mockGetActiveForExecution
    .mockReset()
    .mockResolvedValue({ accountId: "acct-1", providerAccountId: "certstore.myshopify.com" });
  mockGetByCacheKey.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue(undefined);
  mockIncrement.mockReset().mockResolvedValue({ accountCount: 1, sourceCount: 1 });
  armProvider();
});

describe("snapshot cache", () => {
  it("cold miss executes the provider and writes a namespaced account-shared snapshot", async () => {
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const written = mockUpsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(written.providerKey).toBe("shopify");
    expect(written.metricKey).toBe("insights:orders");
    expect(written.accountId).toBe("acct-1");
    expect(written.sourceUserId).toBeNull();
    expect(String(written.cacheKey)).toMatch(/^insights:v1:/);
  });

  it("a fresh hit serves the snapshot without touching Shopify or the limiter", async () => {
    mockGetByCacheKey.mockResolvedValue(snapshot(42, false));
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(42);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("different accounts never share a cache key or a result", async () => {
    const keyOf = (accountId: string) =>
      buildInsightsCacheKey({
        accountId, sourceUserId: null, sourceId: "shopify", datasetId: "orders", query: QUERY,
      });
    expect(keyOf("acct-1")).not.toBe(keyOf("acct-2"));

    await runConnectedAnalyticsQuery(CTX, QUERY);
    armProvider(5);
    const other = await runConnectedAnalyticsQuery({ ...CTX, accountId: "acct-2" }, QUERY);
    expect(other.value).toBe(5);
    expect(mockGetActiveForExecution).toHaveBeenLastCalledWith("acct-2", "shopify", null);
  });

  it("the test-order toggle changes the cache key — filters are part of identity", () => {
    const withToggle = ConnectedAnalyticsQuerySchema.parse({
      ...QUERY,
      filters: { include_test_orders: true },
    });
    const keyOf = (query: typeof QUERY) =>
      buildInsightsCacheKey({
        accountId: "acct-1", sourceUserId: null, sourceId: "shopify", datasetId: "orders", query,
      });
    expect(keyOf(QUERY)).not.toBe(keyOf(withToggle));
  });
});

describe("in-flight coalescing", () => {
  it("collapses identical concurrent cold queries onto one provider scan", async () => {
    const [a, b, c] = await Promise.all([
      runConnectedAnalyticsQuery(CTX, QUERY),
      runConnectedAnalyticsQuery(CTX, QUERY),
      runConnectedAnalyticsQuery(CTX, QUERY),
    ]);
    expect([a.value, b.value, c.value]).toEqual([1, 1, 1]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockIncrement).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce across accounts", async () => {
    await Promise.all([
      runConnectedAnalyticsQuery(CTX, QUERY),
      runConnectedAnalyticsQuery({ ...CTX, accountId: "acct-2" }, QUERY),
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(mockIncrement).toHaveBeenCalledTimes(2);
  });
});

describe("protective limiter", () => {
  it("refuses the query with a retry hint once the shopify budget is spent", async () => {
    mockIncrement.mockResolvedValue({
      accountCount: 1,
      sourceCount: INSIGHTS_SOURCE_LIMIT_PER_WINDOW + 1,
    });
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("scopes the limiter bucket to the account and the shopify source", async () => {
    await runConnectedAnalyticsQuery(CTX, QUERY);
    const call = mockIncrement.mock.calls[0]![0] as Record<string, string>;
    expect(call.accountBucket).toContain("acct-1");
    expect(call.sourceBucket).toContain("acct-1");
    expect(call.sourceBucket).toContain("shopify");
  });
});

describe("stale fallback", () => {
  it("serves an expired snapshot when Shopify rate-limits us", async () => {
    mockGetByCacheKey.mockResolvedValue(snapshot(7, true));
    globalThis.fetch = jest.fn(async () => {
      throw new ShopifyRateLimitError("429");
    }) as unknown as typeof fetch;
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(7);
    expect(r.freshness.stale).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/recently saved data/i);
  });

  it("never serves stale data once the connection is gone", async () => {
    mockGetByCacheKey.mockResolvedValue(snapshot(7, true));
    mockGetActiveForExecution.mockResolvedValue(null);
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "MISSING_CREDENTIAL",
    });
  });

  it("never serves stale data once the token needs reconnecting", async () => {
    const { Unauthorized401Error } = jest.requireActual("@/services/oauth/refreshAndRetry");
    mockGetByCacheKey.mockResolvedValue(snapshot(7, true));
    globalThis.fetch = jest.fn(async () => {
      throw new Unauthorized401Error("shopify");
    }) as unknown as typeof fetch;
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "RECONNECT_REQUIRED",
    });
  });

  it("never serves stale data for a mixed-currency rejection", async () => {
    mockGetByCacheKey.mockResolvedValue(snapshot(7, true));
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({}),
      json: async () => ({
        orders: [
          { created_at: "2026-07-02T10:00:00Z", total_price: "10.00", currency: "USD", financial_status: "paid", fulfillment_status: null, cancelled_at: null, test: false },
          { created_at: "2026-07-02T11:00:00Z", total_price: "10.00", currency: "EUR", financial_status: "paid", fulfillment_status: null, cancelled_at: null, test: false },
        ],
      }),
      text: async () => "",
    })) as unknown as typeof fetch;
    await expect(
      runConnectedAnalyticsQuery(
        CTX,
        ConnectedAnalyticsQuerySchema.parse({ ...QUERY, measure: "total_order_amount" }),
      ),
    ).rejects.toMatchObject({ code: "MIXED_CURRENCY" });
  });
});

describe("exposure", () => {
  it("is queryable in production because live certification passed", async () => {
    const r = await runConnectedAnalyticsQuery(CTX, QUERY, { environment: "production" });
    expect(r.value).toBe(1);
  });
});
