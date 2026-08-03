/** @jest-environment node */
/**
 * ANALYTICS-CONNECTED-DATA-CD-4B — QuickBooks Invoices through the CD-2
 * provider pipeline: snapshot cache, in-flight coalescing, the protective
 * limiter, stale fallback, and account isolation. Driven end-to-end through
 * runConnectedAnalyticsQuery with the REAL adapter; mocks sit at the repo and
 * Intuit HTTP boundaries only.
 */
import { ConnectedAnalyticsQuerySchema } from "@/contracts/connectedAnalytics";

const mockQuickbooksRequest = jest.fn();
jest.mock("@/integrations/_shared/quickbooks/api/_request", () => {
  const actual = jest.requireActual("@/integrations/_shared/quickbooks/api/_request");
  return {
    ...actual,
    quickbooksRequest: (...args: unknown[]) => mockQuickbooksRequest(...args),
  };
});
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
import { RateLimitedError } from "@/integrations/_shared/quickbooks/errors";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const CTX = { accountId: "acct-1", userId: "u1", now: NOW };
const QUERY = ConnectedAnalyticsQuerySchema.parse({
  source: "quickbooks",
  dataset: "invoices",
  measure: "invoice_count",
  dimension: null,
  range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-05T00:00:00.000Z" },
});

function armProvider(count = 1): void {
  mockQuickbooksRequest.mockResolvedValue({
    QueryResponse: {
      Invoice: Array.from({ length: count }, (_, i) => ({
        Id: String(i + 1),
        CustomerRef: { value: "77", name: "Acme Ltd" },
        TxnDate: "2026-07-02",
        TotalAmt: 100,
        Balance: 100,
        CurrencyRef: { value: "USD" },
        MetaData: { CreateTime: "2026-07-02T09:00:00-07:00" },
      })),
    },
  });
}

beforeEach(() => {
  __resetInflightForTesting();
  mockQuickbooksRequest.mockReset();
  mockGetActiveForExecution
    .mockReset()
    .mockResolvedValue({ accountId: "acct-1", providerAccountId: "realm-123" });
  mockGetByCacheKey.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue(undefined);
  mockIncrement.mockReset().mockResolvedValue({ accountCount: 1, sourceCount: 1 });
  armProvider();
});

describe("snapshot cache", () => {
  it("cold miss executes the provider and writes a namespaced snapshot", async () => {
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(1);
    expect(mockQuickbooksRequest).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const written = mockUpsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(written.providerKey).toBe("quickbooks");
    expect(written.metricKey).toBe("insights:invoices");
    expect(written.accountId).toBe("acct-1");
    // Account-class source ⇒ the snapshot is shared across the account's members.
    expect(written.sourceUserId).toBeNull();
    expect(String(written.cacheKey)).toMatch(/^insights:v1:/);
  });

  it("a fresh hit serves the snapshot without touching QuickBooks", async () => {
    mockGetByCacheKey.mockResolvedValue({
      result: {
        kind: "kpi",
        source: {
          sourceId: "quickbooks", sourceLabel: "QuickBooks",
          datasetId: "invoices", datasetLabel: "Invoices",
        },
        measure: { id: "invoice_count", label: "Invoice count" },
        dimension: null,
        grain: null,
        range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-05T00:00:00.000Z" },
        valueMeta: { unit: "count" },
        freshness: { mode: "cached", ageSeconds: 0, ttlSeconds: 600 },
        completeness: { state: "complete" },
        value: 42,
        compare: null,
        warnings: [],
      },
      generatedAt: new Date(NOW - 60_000).toISOString(),
      expiresAt: new Date(NOW + 60_000).toISOString(),
    });
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(42);
    expect(r.freshness.ageSeconds).toBe(60);
    expect(mockQuickbooksRequest).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("different accounts never share a cache key or a result", async () => {
    const a = buildInsightsCacheKey({
      accountId: "acct-1", sourceUserId: null,
      sourceId: "quickbooks", datasetId: "invoices", query: QUERY,
    });
    const b = buildInsightsCacheKey({
      accountId: "acct-2", sourceUserId: null,
      sourceId: "quickbooks", datasetId: "invoices", query: QUERY,
    });
    expect(a).not.toBe(b);

    await runConnectedAnalyticsQuery(CTX, QUERY);
    armProvider(5);
    const other = await runConnectedAnalyticsQuery({ ...CTX, accountId: "acct-2" }, QUERY);
    expect(other.value).toBe(5);
    expect(mockGetActiveForExecution).toHaveBeenLastCalledWith("acct-2", "quickbooks", null);
  });

  it("a different query shape gets its own cache key", async () => {
    const other = ConnectedAnalyticsQuerySchema.parse({
      ...QUERY,
      measure: "outstanding_balance",
    });
    const keyOf = (query: typeof QUERY) =>
      buildInsightsCacheKey({
        accountId: "acct-1", sourceUserId: null,
        sourceId: "quickbooks", datasetId: "invoices", query,
      });
    expect(keyOf(QUERY)).not.toBe(keyOf(other));
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
    expect(mockQuickbooksRequest).toHaveBeenCalledTimes(1);
    // Only the leader spends limiter budget.
    expect(mockIncrement).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce across accounts", async () => {
    await Promise.all([
      runConnectedAnalyticsQuery(CTX, QUERY),
      runConnectedAnalyticsQuery({ ...CTX, accountId: "acct-2" }, QUERY),
    ]);
    expect(mockQuickbooksRequest).toHaveBeenCalledTimes(2);
    expect(mockIncrement).toHaveBeenCalledTimes(2);
  });
});

describe("protective limiter", () => {
  it("refuses the query with a retry hint once the source budget is spent", async () => {
    mockIncrement.mockResolvedValue({
      accountCount: 1,
      sourceCount: INSIGHTS_SOURCE_LIMIT_PER_WINDOW + 1,
    });
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    expect(mockQuickbooksRequest).not.toHaveBeenCalled();
  });

  it("scopes the limiter bucket to the account and the quickbooks source", async () => {
    await runConnectedAnalyticsQuery(CTX, QUERY);
    const call = mockIncrement.mock.calls[0]![0] as Record<string, string>;
    expect(call.accountBucket).toContain("acct-1");
    expect(call.sourceBucket).toContain("acct-1");
    expect(call.sourceBucket).toContain("quickbooks");
  });
});

describe("stale fallback", () => {
  const expired = (value: number) => ({
    result: {
      kind: "kpi",
      source: {
        sourceId: "quickbooks", sourceLabel: "QuickBooks",
        datasetId: "invoices", datasetLabel: "Invoices",
      },
      measure: { id: "invoice_count", label: "Invoice count" },
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
    expiresAt: new Date(NOW - 60_000).toISOString(),
  });

  it("serves an expired snapshot when QuickBooks rate-limits us", async () => {
    mockGetByCacheKey.mockResolvedValue(expired(7));
    mockQuickbooksRequest.mockRejectedValue(new RateLimitedError(30, "tid-1"));
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(7);
    expect(r.freshness.stale).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/recently saved data/i);
  });

  it("never serves stale data once the connection is gone", async () => {
    mockGetByCacheKey.mockResolvedValue(expired(7));
    mockGetActiveForExecution.mockResolvedValue(null);
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "MISSING_CREDENTIAL",
    });
  });

  it("never serves stale data once the connection needs reconnecting", async () => {
    const { IntegrationActionRequiredError } = jest.requireActual(
      "@/services/oauth/refreshAndRetry",
    );
    mockGetByCacheKey.mockResolvedValue(expired(7));
    mockQuickbooksRequest.mockRejectedValue(
      new IntegrationActionRequiredError({
        accountId: "acct-1",
        provider: "quickbooks",
        providerAccountId: "realm-123",
        reason: "refresh_failed",
      }),
    );
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "RECONNECT_REQUIRED",
    });
  });

  it("never serves stale data for a mixed-currency rejection", async () => {
    mockGetByCacheKey.mockResolvedValue(expired(7));
    mockQuickbooksRequest.mockResolvedValue({
      QueryResponse: {
        Invoice: [
          {
            Id: "1", CustomerRef: { value: "77", name: "Acme" }, TxnDate: "2026-07-02",
            TotalAmt: 100, Balance: 0, CurrencyRef: { value: "USD" },
            MetaData: { CreateTime: "2026-07-02T09:00:00Z" },
          },
          {
            Id: "2", CustomerRef: { value: "88", name: "Beta" }, TxnDate: "2026-07-02",
            TotalAmt: 100, Balance: 0, CurrencyRef: { value: "EUR" },
            MetaData: { CreateTime: "2026-07-02T09:00:00Z" },
          },
        ],
      },
    });
    await expect(
      runConnectedAnalyticsQuery(
        CTX,
        ConnectedAnalyticsQuerySchema.parse({ ...QUERY, measure: "total_invoiced_amount" }),
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
