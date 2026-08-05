/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1C — repositories/analyticsSourceSnapshots.ts.
 *
 * `result` is OPAQUE cached evidence at this layer, and deliberately so: TWO
 * contracts share the column (NormalizedAnalyticsResultSchema for widget
 * sources, ConnectedAnalyticsResultSchema for connected datasets), told apart
 * only by the cache-key namespace. Each consumer parses fail-closed and treats
 * an unparseable blob as a cache MISS. So what the repository owes is exact
 * round-tripping — never interpretation — plus a write path that constructs its
 * `Json` instead of asserting one.
 */

interface Result {
  data: unknown;
  error: { message: string } | null;
}

function makeClient(result: Result) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  const record = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      return builder;
    });
  const terminal = (name: string) =>
    jest.fn(async (...args: unknown[]) => {
      calls[name] = args;
      return result;
    });
  Object.assign(builder, {
    select: record("select"),
    upsert: terminal("upsert"),
    delete: record("delete"),
    eq: record("eq"),
    lt: record("lt"),
    maybeSingle: terminal("maybeSingle"),
    then: (resolve: (v: Result) => unknown) => resolve(result),
  });
  return { client: { from: jest.fn((t: string) => { calls.from = [t]; return builder; }) }, calls };
}

const mockClient: { current: unknown } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClient.current),
}));

import {
  getByCacheKey,
  upsertServiceRole,
  deleteExpiredServiceRole,
} from "@/repositories/analyticsSourceSnapshots";

const RESULT = { rows: [{ label: "May", value: 12 }], warnings: [], version: 2 };

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    account_id: "acct-1",
    source_user_id: "user-1",
    provider_key: "quickbooks",
    metric_key: "revenue",
    range_key: "last_30_days",
    group_by: null,
    filters_hash: "h1",
    cache_key: "acct-1:user-1:quickbooks:revenue:last_30_days:h1",
    result: RESULT,
    generated_at: "2026-07-04T00:00:00Z",
    expires_at: "2026-07-04T01:00:00Z",
    ...over,
  };
}

describe("analyticsSourceSnapshots — read", () => {
  it("loads by cache key and maps snake_case → domain", async () => {
    const { client, calls } = makeClient({ data: dbRow(), error: null });
    mockClient.current = client;
    const record = await getByCacheKey("ck");
    expect(calls.from).toEqual(["analytics_source_snapshots"]);
    expect(calls.eq).toEqual(["cache_key", "ck"]);
    expect(record).toEqual({
      id: "s1",
      accountId: "acct-1",
      sourceUserId: "user-1",
      providerKey: "quickbooks",
      metricKey: "revenue",
      rangeKey: "last_30_days",
      groupBy: null,
      filtersHash: "h1",
      cacheKey: "acct-1:user-1:quickbooks:revenue:last_30_days:h1",
      result: RESULT,
      generatedAt: "2026-07-04T00:00:00Z",
      expiresAt: "2026-07-04T01:00:00Z",
    });
  });

  it("selects a PROJECTION — it never asks for columns it does not map", async () => {
    const { client, calls } = makeClient({ data: dbRow(), error: null });
    mockClient.current = client;
    await getByCacheKey("ck");
    const projection = String(calls.select![0]).split(",");
    expect(projection).not.toContain("created_at");
    expect(projection).not.toContain("updated_at");
    expect(projection).toContain("result");
  });

  it("returns the cached payload UNCHANGED, whatever shape it has", async () => {
    // A snapshot written by either consumer's schema — plus a key this
    // repository has never heard of — must survive the round trip intact.
    const opaque = { schemaVersion: "v9", series: [{ t: null, v: 1.5 }], futureKey: { nested: true } };
    const { client } = makeClient({ data: dbRow({ result: opaque }), error: null });
    mockClient.current = client;
    const record = await getByCacheKey("ck");
    expect(record!.result).toEqual(opaque);
  });

  it("returns null for a cache miss and preserves a null source_user_id", async () => {
    mockClient.current = makeClient({ data: null, error: null }).client;
    expect(await getByCacheKey("ck")).toBeNull();

    mockClient.current = makeClient({ data: dbRow({ source_user_id: null }), error: null }).client;
    expect((await getByCacheKey("ck"))!.sourceUserId).toBeNull();
  });

  it("throws on a read error rather than reporting a miss", async () => {
    mockClient.current = makeClient({ data: null, error: { message: "down" } }).client;
    await expect(getByCacheKey("ck")).rejects.toThrow(
      /analytics_source_snapshots\.getByCacheKey failed: down/,
    );
  });
});

describe("analyticsSourceSnapshots — upsert", () => {
  const input = {
    accountId: "acct-1",
    sourceUserId: "user-1",
    providerKey: "quickbooks",
    metricKey: "revenue",
    rangeKey: "last_30_days",
    groupBy: null,
    filtersHash: "h1",
    cacheKey: "ck",
    result: RESULT,
    generatedAt: "2026-07-04T00:00:00Z",
    expiresAt: "2026-07-04T01:00:00Z",
  };

  it("upserts in place on cache_key with a snake_case payload", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    mockClient.current = client;
    await upsertServiceRole(input);
    expect(calls.upsert![0]).toEqual({
      account_id: "acct-1",
      source_user_id: "user-1",
      provider_key: "quickbooks",
      metric_key: "revenue",
      range_key: "last_30_days",
      group_by: null,
      filters_hash: "h1",
      cache_key: "ck",
      result: RESULT,
      generated_at: "2026-07-04T00:00:00Z",
      expires_at: "2026-07-04T01:00:00Z",
    });
    expect(calls.upsert![1]).toEqual({ onConflict: "cache_key" });
    expect(Object.keys(calls.upsert![0] as object)).not.toContain("id");
  });

  it("stores the result payload unchanged", async () => {
    const exotic = { a: [1, null, "x"], b: { c: false }, d: 0 };
    const { client, calls } = makeClient({ data: null, error: null });
    mockClient.current = client;
    await upsertServiceRole({ ...input, result: exotic });
    expect((calls.upsert![0] as Record<string, unknown>).result).toEqual(exotic);
  });

  it("rejects a non-JSON-encodable result before it reaches the database", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    mockClient.current = client;
    await expect(
      upsertServiceRole({ ...input, result: { total: 10n } }),
    ).rejects.toThrow(/analytics_source_snapshots\.result\.total: BigInt cannot be stored in a JSON column/);
    expect(calls.upsert).toBeUndefined();
  });

  it("throws on an upsert error", async () => {
    mockClient.current = makeClient({ data: null, error: { message: "down" } }).client;
    await expect(upsertServiceRole(input)).rejects.toThrow(
      /analytics_source_snapshots\.upsertServiceRole failed: down/,
    );
  });
});

describe("analyticsSourceSnapshots — deleteExpired", () => {
  it("deletes strictly older than the cutoff and counts the removed rows", async () => {
    const { client, calls } = makeClient({ data: [{ id: "s1" }, { id: "s2" }], error: null });
    mockClient.current = client;
    expect(await deleteExpiredServiceRole("2026-07-04T02:00:00Z")).toBe(2);
    expect(calls.lt).toEqual(["expires_at", "2026-07-04T02:00:00Z"]);
    expect(calls.select).toEqual(["id"]);
  });

  it("reports 0 when nothing expired", async () => {
    mockClient.current = makeClient({ data: null, error: null }).client;
    expect(await deleteExpiredServiceRole("2026-07-04T02:00:00Z")).toBe(0);
  });

  it("throws on error rather than reporting 0 deletions", async () => {
    mockClient.current = makeClient({ data: null, error: { message: "down" } }).client;
    await expect(deleteExpiredServiceRole("x")).rejects.toThrow(
      /analytics_source_snapshots\.deleteExpiredServiceRole failed: down/,
    );
  });
});
