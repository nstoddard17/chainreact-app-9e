/** @jest-environment node */
/**
 * ANALYTICS-CONNECTED-DATA-CD-2 — provider pipeline: snapshot cache, in-flight
 * coalescing, and the protective limiter, driven end-to-end through
 * runConnectedAnalyticsQuery with the real Stripe adapter and mocks at the
 * repo/HTTP boundaries only.
 */
import { ConnectedAnalyticsQuerySchema } from "@/contracts/connectedAnalytics";

const mockChargesList = jest.fn();
jest.mock("@/integrations/stripe/api/charges", () => ({
  chargesList: (...args: unknown[]) => mockChargesList(...args),
}));
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
import {
  INSIGHTS_SOURCE_LIMIT_PER_WINDOW,
  buildInsightsRateBuckets,
} from "@/core/analytics/insightsRateLimitPolicy";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const CTX = { accountId: "acct-1", userId: "u1", now: NOW };
const QUERY = ConnectedAnalyticsQuerySchema.parse({
  source: "stripe",
  dataset: "payments",
  measure: "payment_count",
  dimension: null,
  range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-04T00:00:00.000Z" },
});

function armProvider(count = 1) {
  mockChargesList.mockResolvedValue({
    data: Array.from({ length: count }, (_, i) => ({
      id: `ch_${i}`,
      created: Math.floor(Date.parse("2026-07-02T10:00:00Z") / 1000),
      status: "succeeded",
      amount: 100,
      currency: "usd",
    })),
    has_more: false,
  });
}

beforeEach(() => {
  __resetInflightForTesting();
  mockChargesList.mockReset();
  mockGetActiveForExecution.mockReset().mockResolvedValue({ providerAccountId: "acct_s" });
  mockGetByCacheKey.mockReset().mockResolvedValue(null);
  mockUpsert.mockReset().mockResolvedValue(undefined);
  mockIncrement.mockReset().mockResolvedValue({ accountCount: 1, sourceCount: 1 });
  armProvider();
});

describe("snapshot cache", () => {
  it("cold miss executes provider + writes namespaced snapshot; budget consumed once", async () => {
    const r = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(r.value).toBe(1);
    expect(mockChargesList).toHaveBeenCalledTimes(1);
    expect(mockIncrement).toHaveBeenCalledTimes(1);
    const up = mockUpsert.mock.calls[0]![0];
    expect(up.cacheKey.startsWith("insights:v1:")).toBe(true);
    expect(up.metricKey).toBe("insights:payments");
    expect(up.sourceUserId).toBeNull(); // Stripe is account-class
    expect(up.accountId).toBe("acct-1");
  });

  it("fresh hit serves the snapshot: no provider call, no budget", async () => {
    const stored = await runConnectedAnalyticsQuery(CTX, QUERY);
    const up = mockUpsert.mock.calls[0]![0];
    mockChargesList.mockClear();
    mockIncrement.mockClear();
    mockGetByCacheKey.mockResolvedValue({
      ...up,
      result: stored,
      generatedAt: new Date(NOW - 60_000).toISOString(),
      expiresAt: new Date(NOW + 60_000).toISOString(),
      id: "snap-1",
    });
    const cached = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(cached.value).toBe(1);
    expect(cached.freshness).toMatchObject({ mode: "cached", ageSeconds: 60 });
    expect(mockChargesList).not.toHaveBeenCalled();
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("cache keys isolate account / query / range / user; deterministic under key order", () => {
    const id = (over: Record<string, unknown>) => ({
      accountId: "acct-1", sourceUserId: null, sourceId: "stripe", datasetId: "payments",
      query: QUERY, ...over,
    });
    const base = buildInsightsCacheKey(id({}) as never);
    expect(buildInsightsCacheKey(id({ accountId: "acct-2" }) as never)).not.toBe(base);
    expect(buildInsightsCacheKey(id({ sourceUserId: "u9" }) as never)).not.toBe(base);
    expect(
      buildInsightsCacheKey(
        id({ query: { ...QUERY, filters: { currency: ["eur"] } } }) as never,
      ),
    ).not.toBe(base);
    // Same logical query, different object key insertion order → same key.
    const reordered = JSON.parse(JSON.stringify({ ...QUERY }));
    expect(buildInsightsCacheKey(id({ query: reordered }) as never)).toBe(base);
  });

  it("stale fallback on transient provider failure only; credential errors rethrow", async () => {
    const stored = await runConnectedAnalyticsQuery(CTX, QUERY);
    const up = mockUpsert.mock.calls[0]![0];
    const expired = {
      ...up, result: stored, id: "snap-1",
      generatedAt: new Date(NOW - 3600_000).toISOString(),
      expiresAt: new Date(NOW - 1000).toISOString(),
    };
    mockGetByCacheKey.mockResolvedValue(expired);
    mockChargesList.mockRejectedValue(new Error("HTTP 429 too many requests"));
    const stale = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(stale.freshness.stale).toBe(true);
    expect(stale.warnings.some((w) => w.includes("recently saved"))).toBe(true);

    // Reconnect-required must NOT serve stale data.
    const { Unauthorized401Error } = jest.requireActual("@/services/oauth/refreshAndRetry");
    __resetInflightForTesting();
    mockChargesList.mockRejectedValue(new Unauthorized401Error("401"));
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "RECONNECT_REQUIRED",
    });
    __resetInflightForTesting();
    mockGetActiveForExecution.mockResolvedValue(null);
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "MISSING_CREDENTIAL",
    });
  });
});

describe("in-flight coalescing", () => {
  it("10 identical concurrent cold requests → 1 provider execution, 1 budget unit, same values", async () => {
    let resolveGate: () => void = () => {};
    const gate = new Promise<void>((res) => (resolveGate = res));
    mockChargesList.mockImplementation(async () => {
      await gate;
      return { data: [{ id: "ch_0", created: Math.floor(Date.parse("2026-07-02T10:00:00Z") / 1000), status: "succeeded", amount: 100, currency: "usd" }], has_more: false };
    });
    const calls = Promise.all(
      Array.from({ length: 10 }, () => runConnectedAnalyticsQuery(CTX, QUERY)),
    );
    await new Promise((r) => setTimeout(r, 20));
    resolveGate();
    const results = await calls;
    expect(mockChargesList).toHaveBeenCalledTimes(1);
    expect(mockIncrement).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((r) => r.value)).size).toBe(1);
  });

  it("a shared failure cleans up; a later retry executes fresh", async () => {
    mockChargesList.mockRejectedValueOnce(new Error("boom"));
    const [a, b] = await Promise.allSettled([
      runConnectedAnalyticsQuery(CTX, QUERY),
      runConnectedAnalyticsQuery(CTX, QUERY),
    ]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    expect(mockChargesList).toHaveBeenCalledTimes(1);
    armProvider();
    const retry = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(retry.value).toBe(1);
    expect(mockChargesList).toHaveBeenCalledTimes(2);
  });

  it("different accounts / different queries never coalesce", async () => {
    await Promise.all([
      runConnectedAnalyticsQuery(CTX, QUERY),
      runConnectedAnalyticsQuery({ ...CTX, accountId: "acct-2" }, QUERY),
      runConnectedAnalyticsQuery(CTX, {
        ...QUERY,
        filters: { currency: ["eur"] },
      }),
    ]);
    expect(mockChargesList).toHaveBeenCalledTimes(3);
    expect(mockIncrement).toHaveBeenCalledTimes(3);
  });
});

describe("protective limiter", () => {
  it("policy buckets isolate account/source/user and window-align", () => {
    const b = buildInsightsRateBuckets({
      accountId: "a1", sourceId: "stripe", sourceUserId: null, nowMs: NOW,
    });
    expect(b.accountBucket).toBe(`apl:acct:a1:${b.windowStartMs}`);
    expect(b.sourceBucket).toBe(`apl:src:a1:stripe:${b.windowStartMs}`);
    const personal = buildInsightsRateBuckets({
      accountId: "a1", sourceId: "gmail", sourceUserId: "u7", nowMs: NOW,
    });
    expect(personal.sourceBucket).toContain(":u:u7:");
    expect(b.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("over-limit leader → typed 429 RATE_LIMITED with retry hint; stale snapshot still serves", async () => {
    mockIncrement.mockResolvedValue({
      accountCount: 1,
      sourceCount: INSIGHTS_SOURCE_LIMIT_PER_WINDOW + 1,
    });
    await expect(runConnectedAnalyticsQuery(CTX, QUERY)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: expect.any(Number),
    });
    expect(mockChargesList).not.toHaveBeenCalled();

    // With an expired snapshot available, the protective limit degrades to stale.
    const fresh = { ...CTX };
    mockIncrement.mockResolvedValueOnce({ accountCount: 1, sourceCount: 1 });
    __resetInflightForTesting();
    armProvider();
    const stored = await runConnectedAnalyticsQuery(fresh, QUERY);
    const up = mockUpsert.mock.calls[0]![0];
    mockGetByCacheKey.mockResolvedValue({
      ...up, result: stored, id: "s",
      generatedAt: new Date(NOW - 3600_000).toISOString(),
      expiresAt: new Date(NOW - 1).toISOString(),
    });
    mockIncrement.mockResolvedValue({ accountCount: 99, sourceCount: 99 });
    __resetInflightForTesting();
    const stale = await runConnectedAnalyticsQuery(CTX, QUERY);
    expect(stale.freshness.stale).toBe(true);
  });
});
