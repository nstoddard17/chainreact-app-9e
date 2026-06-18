/**
 * @jest-environment node
 *
 * Analytics source cache layer (Slice ANALYTICS-SOURCES-CACHE-1): cache-first,
 * refresh bypass, stale fallback, validation, and personal-credential key
 * isolation. Repo is mocked; a fake adapter stands in for a source.
 */

jest.mock("@/repositories/analyticsSourceSnapshots", () => ({
  getByCacheKey: jest.fn(),
  upsertServiceRole: jest.fn(),
}));

import {
  queryWithCache,
  computeCacheKey,
  computeFiltersHash,
  computeRangeKey,
  resolveTtlSeconds,
} from "@/services/analytics/sources/cache";
import {
  AnalyticsSourceError,
  type AnalyticsSourceAdapter,
  type NormalizedAnalyticsResult,
} from "@/services/analytics/sources/types";
import * as repo from "@/repositories/analyticsSourceSnapshots";

const mockGet = repo.getByCacheKey as jest.MockedFunction<typeof repo.getByCacheKey>;
const mockUpsert = repo.upsertServiceRole as jest.MockedFunction<typeof repo.upsertServiceRole>;

const CTX = { accountId: "acct-1", userId: "user-1" };
const RANGE = { since: "2026-06-01T00:00:00Z", until: "2026-06-08T00:00:00Z" };

function result(): NormalizedAnalyticsResult {
  return {
    shape: "scalar",
    dimensions: [],
    measures: ["open_issues"],
    rows: [{ open_issues: 7 }],
    totals: { open_issues: 7 },
    generatedAt: "2026-06-08T00:00:00Z",
    freshness: { cached: false, ageSeconds: 0, ttlSeconds: null },
    warnings: [],
    truncated: false,
  };
}

function fakeSource(overrides: Partial<AnalyticsSourceAdapter> = {}): AnalyticsSourceAdapter {
  return {
    providerKey: "github", // personal provider
    displayName: "GitHub",
    connectedApp: true,
    cacheTtlSeconds: 600,
    metrics: [],
    query: jest.fn().mockResolvedValue(result()),
    ...overrides,
  };
}

function snapshotRow(opts: { result: unknown; expiresInMs: number; generatedAgoMs?: number }) {
  const now = Date.now();
  return {
    id: "snap-1",
    accountId: "acct-1",
    sourceUserId: "user-1",
    providerKey: "github",
    metricKey: "open_issues",
    rangeKey: computeRangeKey(RANGE),
    groupBy: null,
    filtersHash: computeFiltersHash({ repo: "o/n" }),
    cacheKey: "k",
    result: opts.result,
    generatedAt: new Date(now - (opts.generatedAgoMs ?? 60_000)).toISOString(),
    expiresAt: new Date(now + opts.expiresInMs).toISOString(),
  };
}

const PARAMS = { context: CTX, metricKey: "open_issues", range: RANGE, filters: { repo: "o/n" } };

beforeEach(() => jest.clearAllMocks());

describe("pure key helpers", () => {
  it("filters hash is order-independent", () => {
    expect(computeFiltersHash({ a: 1, b: 2 })).toBe(computeFiltersHash({ b: 2, a: 1 }));
  });
  it("range key is UTC-day bucketed (sub-day differences collapse)", () => {
    expect(
      computeRangeKey({ since: "2026-06-01T01:00:00Z", until: "2026-06-08T23:59:00Z" }),
    ).toBe("2026-06-01..2026-06-08");
  });
  it("cache key isolates personal sources by source user", () => {
    const base = {
      accountId: "acct-1",
      providerKey: "github",
      metricKey: "open_issues",
      rangeKey: "r",
      groupBy: null,
      filtersHash: "f",
    };
    const a = computeCacheKey({ ...base, sourceUserId: "user-1" });
    const b = computeCacheKey({ ...base, sourceUserId: "user-2" });
    const acct = computeCacheKey({ ...base, sourceUserId: null });
    expect(a).not.toBe(b);
    expect(a).not.toBe(acct);
  });
  it("resolveTtlSeconds treats missing/0 as no-cache", () => {
    expect(resolveTtlSeconds(fakeSource({ cacheTtlSeconds: 0 }))).toBe(0);
    expect(resolveTtlSeconds(fakeSource({ cacheTtlSeconds: undefined }))).toBe(0);
    expect(resolveTtlSeconds(fakeSource({ cacheTtlSeconds: 600 }))).toBe(600);
  });
});

describe("queryWithCache", () => {
  it("ttl<=0 → always live, never touches the cache", async () => {
    const src = fakeSource({ cacheTtlSeconds: 0 });
    const r = await queryWithCache(src, PARAMS);
    expect(src.query).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(r.freshness.cached).toBe(false);
  });

  it("fresh cache hit returns cached result without calling the provider", async () => {
    mockGet.mockResolvedValueOnce(snapshotRow({ result: result(), expiresInMs: 300_000 }) as never);
    const src = fakeSource();
    const r = await queryWithCache(src, PARAMS);
    expect(src.query).not.toHaveBeenCalled();
    expect(r.freshness.cached).toBe(true);
    expect(r.freshness.stale).toBe(false);
    expect(r.freshness.ttlSeconds).toBe(600);
    expect(r.freshness.ageSeconds).toBeGreaterThanOrEqual(0);
  });

  it("miss → calls provider and upserts a fresh snapshot", async () => {
    mockGet.mockResolvedValueOnce(null);
    const src = fakeSource();
    const r = await queryWithCache(src, PARAMS);
    expect(src.query).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(r.freshness.cached).toBe(false);
  });

  it("stale (expired) snapshot → refreshes via provider + upserts", async () => {
    mockGet.mockResolvedValue(snapshotRow({ result: result(), expiresInMs: -1000 }) as never);
    const src = fakeSource();
    await queryWithCache(src, PARAMS);
    expect(src.query).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("refresh:true bypasses the cache read and refetches", async () => {
    const src = fakeSource();
    await queryWithCache(src, PARAMS, { refresh: true });
    expect(mockGet).not.toHaveBeenCalled();
    expect(src.query).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("invalid cached blob is treated as a miss", async () => {
    mockGet.mockResolvedValue(snapshotRow({ result: { garbage: true }, expiresInMs: 300_000 }) as never);
    const src = fakeSource();
    await queryWithCache(src, PARAMS);
    expect(src.query).toHaveBeenCalledTimes(1);
  });

  it("transient provider error → serves stale snapshot with a warning", async () => {
    mockGet.mockResolvedValue(snapshotRow({ result: result(), expiresInMs: -1000 }) as never);
    const src = fakeSource({
      query: jest.fn().mockRejectedValue(new AnalyticsSourceError("rate", "RATE_LIMITED")),
    });
    const r = await queryWithCache(src, PARAMS);
    expect(r.freshness.cached).toBe(true);
    expect(r.freshness.stale).toBe(true);
    expect(r.warnings.some((w) => /cached data/i.test(w))).toBe(true);
  });

  it("non-transient error (MISSING_CREDENTIAL) rethrows even with a snapshot present", async () => {
    mockGet.mockResolvedValue(snapshotRow({ result: result(), expiresInMs: -1000 }) as never);
    const src = fakeSource({
      query: jest.fn().mockRejectedValue(new AnalyticsSourceError("connect", "MISSING_CREDENTIAL")),
    });
    await expect(queryWithCache(src, PARAMS)).rejects.toMatchObject({ code: "MISSING_CREDENTIAL" });
  });

  it("transient error with NO snapshot rethrows", async () => {
    mockGet.mockResolvedValue(null);
    const src = fakeSource({
      query: jest.fn().mockRejectedValue(new AnalyticsSourceError("rate", "RATE_LIMITED")),
    });
    await expect(queryWithCache(src, PARAMS)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("account-shared provider caches with a null source user (account-visible)", async () => {
    mockGet.mockResolvedValueOnce(null);
    const src = fakeSource({ providerKey: "slack", connectedApp: true });
    await queryWithCache(src, { ...PARAMS, filters: undefined });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUserId: null, providerKey: "slack" }),
    );
  });

  it("personal provider caches pinned to the requesting user", async () => {
    mockGet.mockResolvedValueOnce(null);
    const src = fakeSource(); // github
    await queryWithCache(src, PARAMS);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUserId: "user-1", providerKey: "github" }),
    );
  });

  it("a cache-write failure does not fail the query", async () => {
    mockGet.mockResolvedValueOnce(null);
    mockUpsert.mockRejectedValueOnce(new Error("db down"));
    const src = fakeSource();
    const r = await queryWithCache(src, PARAMS);
    expect(r.freshness.cached).toBe(false); // live result still returned
  });
});
