/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1C — repositories/analyticsDashboards.ts.
 *
 * The repository keeps `widgets` OPAQUE: validation lives at the single service
 * chokepoint (`normalizeDashboardWidgets` / `validateLayout`), so what these
 * tests pin is that the repository neither inspects nor reshapes the payload —
 * and that the WRITE path constructs its `Json` value rather than asserting
 * one, so a non-encodable board is refused at the boundary instead of reaching
 * Postgres.
 *
 * (This test lives under `analytics/` because `tests/unit/repositories/` sits
 * exactly at the 50-file leaf cap — see
 * docs/rules/project-structure-and-module-boundaries.md.)
 */

interface Result {
  data: unknown;
  error: (Record<string, unknown> & { message: string }) | null;
}

/** A chainable PostgREST-shaped builder that records every call it received. */
function makeClient(result: Result) {
  const calls: Record<string, unknown[]> = {};
  const ordered: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  const record = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      ordered.push([name, args]);
      return builder;
    });
  const terminal = (name: string) =>
    jest.fn(async (...args: unknown[]) => {
      calls[name] = args;
      ordered.push([name, args]);
      return result;
    });
  Object.assign(builder, {
    select: record("select"),
    insert: record("insert"),
    update: record("update"),
    delete: record("delete"),
    eq: record("eq"),
    order: record("order"),
    limit: record("limit"),
    single: terminal("single"),
    maybeSingle: terminal("maybeSingle"),
    then: (resolve: (v: Result) => unknown) => resolve(result),
  });
  return { client: { from: jest.fn((t: string) => { calls.from = [t]; return builder; }) }, calls, ordered };
}

const mockClient: { current: unknown } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClient.current),
}));
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockClient.current),
}));

import {
  listByAccount,
  getByIdServiceRole,
  createServiceRole,
  seedDefaultServiceRole,
  updateServiceRole,
  deleteServiceRole,
  nextPositionServiceRole,
} from "@/repositories/analyticsDashboards";

const WIDGETS = [{ id: "w1", type: "kpi", title: "Runs" }];

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    account_id: "acct-1",
    created_by_user_id: "user-1",
    name: "Overview",
    position: 0,
    is_default: true,
    widgets: WIDGETS,
    created_at: "2026-07-02T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    ...over,
  };
}

describe("analyticsDashboards — reads", () => {
  it("lists an account's boards in tab order and maps snake_case → domain", async () => {
    const { client, calls } = makeClient({ data: [dbRow()], error: null });
    mockClient.current = client;
    const records = await listByAccount("acct-1");
    expect(calls.from).toEqual(["analytics_dashboards"]);
    expect(calls.eq).toEqual(["account_id", "acct-1"]);
    expect(records).toEqual([
      {
        id: "d1",
        accountId: "acct-1",
        createdByUserId: "user-1",
        name: "Overview",
        position: 0,
        isDefault: true,
        widgets: WIDGETS,
        createdAt: "2026-07-02T00:00:00Z",
        updatedAt: "2026-07-02T00:00:00Z",
      },
    ]);
  });

  it("returns the widgets payload byte-for-byte — the repository never reshapes it", async () => {
    const exotic = [{ id: "w1", nested: { deep: [1, 2, { k: "v" }] }, unknownFutureKey: true }];
    const { client } = makeClient({ data: [dbRow({ widgets: exotic })], error: null });
    mockClient.current = client;
    const [record] = await listByAccount("acct-1");
    expect(record!.widgets).toEqual(exotic);
  });

  it("preserves a null created_by_user_id rather than inventing an owner", async () => {
    const { client } = makeClient({ data: [dbRow({ created_by_user_id: null })], error: null });
    mockClient.current = client;
    const [record] = await listByAccount("acct-1");
    expect(record!.createdByUserId).toBeNull();
  });

  it("throws on a list error", async () => {
    mockClient.current = makeClient({ data: null, error: { message: "down" } }).client;
    await expect(listByAccount("acct-1")).rejects.toThrow(
      /analytics_dashboards\.listByAccount failed: down/,
    );
  });

  it("getByIdServiceRole returns null for a missing row and maps a present one", async () => {
    mockClient.current = makeClient({ data: null, error: null }).client;
    expect(await getByIdServiceRole("d1")).toBeNull();

    const { client, calls } = makeClient({ data: dbRow(), error: null });
    mockClient.current = client;
    const record = await getByIdServiceRole("d1");
    expect(calls.eq).toEqual(["id", "d1"]);
    expect(record).toMatchObject({ id: "d1", accountId: "acct-1" });
  });
});

describe("analyticsDashboards — writes", () => {
  const input = {
    accountId: "acct-1",
    createdByUserId: "user-1",
    name: "Overview",
    position: 0,
    isDefault: true,
    widgets: WIDGETS,
  };

  it("creates with a snake_case payload carrying no database-managed columns", async () => {
    const { client, calls } = makeClient({ data: dbRow(), error: null });
    mockClient.current = client;
    await createServiceRole(input);
    const payload = calls.insert![0] as Record<string, unknown>;
    expect(payload).toEqual({
      account_id: "acct-1",
      created_by_user_id: "user-1",
      name: "Overview",
      position: 0,
      is_default: true,
      widgets: WIDGETS,
    });
    // id / created_at / updated_at are the database's to assign.
    expect(Object.keys(payload)).not.toContain("id");
    expect(Object.keys(payload)).not.toContain("created_at");
    expect(Object.keys(payload)).not.toContain("updated_at");
  });

  it("seedDefault returns null on the one-default unique violation and throws otherwise", async () => {
    mockClient.current = makeClient({ data: null, error: { code: "23505", message: "dup" } }).client;
    expect(await seedDefaultServiceRole(input)).toBeNull();

    mockClient.current = makeClient({ data: null, error: { code: "42501", message: "denied" } }).client;
    await expect(seedDefaultServiceRole(input)).rejects.toThrow(
      /analytics_dashboards\.seedDefaultServiceRole failed: denied/,
    );
  });

  it("updates SPARSELY — an absent key is never written", async () => {
    const { client, calls } = makeClient({ data: dbRow({ name: "Renamed" }), error: null });
    mockClient.current = client;
    await updateServiceRole("d1", { name: "Renamed" });
    expect(calls.update![0]).toEqual({ name: "Renamed" });
    expect(calls.eq).toEqual(["id", "d1"]);
  });

  it("writes widgets on update only when the patch carries them", async () => {
    const { client, calls } = makeClient({ data: dbRow(), error: null });
    mockClient.current = client;
    await updateServiceRole("d1", { position: 2, widgets: WIDGETS });
    expect(calls.update![0]).toEqual({ position: 2, widgets: WIDGETS });
  });

  it("rejects a non-JSON-encodable board before it reaches the database", async () => {
    const circular: Record<string, unknown> = { id: "w1" };
    circular.self = circular;
    const { client, calls } = makeClient({ data: dbRow(), error: null });
    mockClient.current = client;
    await expect(createServiceRole({ ...input, widgets: [circular] })).rejects.toThrow(
      /analytics_dashboards\.widgets\[0\]\.self: circular reference cannot be stored in a JSON column/,
    );
    expect(calls.insert).toBeUndefined();
  });

  it("deletes by id", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    mockClient.current = client;
    await deleteServiceRole("d1");
    expect(calls.delete).toEqual([]);
    expect(calls.eq).toEqual(["id", "d1"]);
  });
});

describe("analyticsDashboards — nextPosition", () => {
  it("returns max(position) + 1", async () => {
    const { client, calls } = makeClient({ data: { position: 4 }, error: null });
    mockClient.current = client;
    expect(await nextPositionServiceRole("acct-1")).toBe(5);
    // A one-column PROJECTION, not a whole row.
    expect(calls.select).toEqual(["position"]);
    expect(calls.limit).toEqual([1]);
  });

  it("returns 0 for an account with no boards", async () => {
    mockClient.current = makeClient({ data: null, error: null }).client;
    expect(await nextPositionServiceRole("acct-1")).toBe(0);
  });

  it("throws on error rather than silently seeding position 0", async () => {
    mockClient.current = makeClient({ data: null, error: { message: "down" } }).client;
    await expect(nextPositionServiceRole("acct-1")).rejects.toThrow(
      /analytics_dashboards\.nextPositionServiceRole failed: down/,
    );
  });
});
