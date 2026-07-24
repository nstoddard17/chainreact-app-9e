/**
 * @jest-environment node
 *
 * Tests for repositories/resourceLinks/accountResourceLinks.ts (5.TRUCK-BRIDGE-1 CS-1). No DB.
 *
 * Two complementary harnesses:
 *
 *   1. A RECORDING client (the established accountApiKeys pattern) that captures
 *      the exact filters + payloads, so we can prove every query carries its
 *      `account_id` predicate and that the insert writes only approved columns.
 *
 *   2. A small IN-MEMORY TABLE that actually EVALUATES `eq` / `is` predicates.
 *      This proves the isolation *semantics* rather than merely that a filter
 *      was recorded: account A genuinely cannot retrieve account B's row, an
 *      archived row genuinely disappears from active lookup, and a re-link after
 *      archival genuinely resolves to the new row.
 *
 * The service role BYPASSES RLS, so these `account_id` predicates ARE the tenant
 * boundary for every call in this repository. That is what makes suite 2 a
 * security test and not a formality.
 */

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
}

// ── Harness 1: recording client ─────────────────────────────────────────────
interface State {
  insertPayload?: Record<string, unknown>;
  updatePayload?: Record<string, unknown>;
  selectCols: string[];
  filters: Array<[string, string, unknown]>;
  result: Result;
}

function makeRecordingClient(state: State) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    insert: (p: unknown) => ((state.insertPayload = p as Record<string, unknown>), b),
    update: (p: unknown) => ((state.updatePayload = p as Record<string, unknown>), b),
    select: (c?: string) => (state.selectCols.push(c ?? "*"), b),
    eq: (col: string, v: unknown) => (state.filters.push(["eq", col, v]), b),
    is: (col: string, v: unknown) => (state.filters.push(["is", col, v]), b),
    order: () => b,
    single: async () => state.result,
    maybeSingle: async () => state.result,
    then: (resolve: (v: Result) => void) => resolve(state.result),
  });
  return { from: () => b };
}

// ── Harness 2: in-memory table that evaluates predicates ────────────────────
type Row = Record<string, unknown>;

function makeInMemoryClient(rows: Row[]) {
  return {
    from: () => {
      const preds: Array<(r: Row) => boolean> = [];
      let mode: "select" | "insert" | "update" = "select";
      let patch: Row = {};
      let inserted: Row | null = null;

      const apply = (): Row[] => rows.filter((r) => preds.every((p) => p(r)));

      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        order: () => b,
        eq: (col: string, v: unknown) => (preds.push((r) => r[col] === v), b),
        is: (col: string, v: unknown) => (preds.push((r) => r[col] === v), b),
        insert: (p: Row) => {
          mode = "insert";
          inserted = { id: `link-${rows.length + 1}`, created_at: "T0", updated_at: "T0", ...p };
          return b;
        },
        update: (p: Row) => {
          mode = "update";
          patch = p;
          return b;
        },
        single: async (): Promise<Result> => {
          if (mode === "insert") {
            rows.push(inserted!);
            return { data: inserted, error: null };
          }
          const hit = apply();
          return hit.length === 1
            ? { data: hit[0], error: null }
            : { data: null, error: { message: "no row" } };
        },
        maybeSingle: async (): Promise<Result> => {
          if (mode === "update") {
            const hit = apply();
            if (hit.length === 0) return { data: null, error: null };
            Object.assign(hit[0]!, patch);
            return { data: hit[0], error: null };
          }
          const hit = apply();
          return { data: hit[0] ?? null, error: null };
        },
        then: (resolve: (v: Result) => void) => resolve({ data: apply(), error: null }),
      });
      return b;
    },
  };
}

const mockClient: { current: unknown } = { current: null };
// Typed as (reason: string) => unknown so `mock.calls[i][0]` is the reason string
// — the audit argument this suite asserts on.
const getServiceRoleClientMock = jest.fn((_reason: string): unknown => mockClient.current);
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (reason: string) => getServiceRoleClientMock(reason),
}));

import {
  listLinks,
  findActiveLink,
  createConfirmedLink,
  archiveLink,
} from "@/repositories/resourceLinks/accountResourceLinks";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const USER_1 = "33333333-3333-4333-8333-333333333333";
const CONFIRMED_AT = "2026-07-24T12:00:00Z";

/** A realistic stored row: Motive vehicle 88231 → Fleetio vehicle 42. */
function row(over: Partial<Row> = {}): Row {
  return {
    id: "link-1",
    account_id: ACCOUNT_A,
    resource_kind: "vehicle",
    source_provider: "motive",
    source_external_id: "motive-veh-88231",
    target_provider: "fleetio",
    target_external_id: "42",
    source_label: "Unit 104",
    target_label: "Truck 104",
    match_basis: "manual",
    created_by_user_id: USER_1,
    confirmed_by_user_id: USER_1,
    confirmed_at: CONFIRMED_AT,
    archived_at: null,
    created_at: "2026-07-24T12:00:00Z",
    updated_at: "2026-07-24T12:00:00Z",
    ...over,
  };
}

function setupRecording(result: Result): State {
  const state: State = { selectCols: [], filters: [], result };
  mockClient.current = makeRecordingClient(state);
  return state;
}

function setupInMemory(rows: Row[]) {
  mockClient.current = makeInMemoryClient(rows);
  return rows;
}

const VALID_CREATE = {
  accountId: ACCOUNT_A,
  resourceKind: "vehicle" as const,
  sourceProvider: "motive",
  sourceExternalId: "motive-veh-88231",
  targetProvider: "fleetio",
  targetExternalId: "42",
  sourceLabel: "Unit 104",
  targetLabel: "Truck 104",
  matchBasis: "manual" as const,
  createdByUserId: USER_1,
  confirmedByUserId: USER_1,
  confirmedAt: CONFIRMED_AT,
};

beforeEach(() => {
  getServiceRoleClientMock.mockClear();
});

describe("createConfirmedLink", () => {
  it("writes exactly the approved columns and returns the DTO", async () => {
    const state = setupRecording({ data: row(), error: null });
    const dto = await createConfirmedLink(VALID_CREATE);

    expect(state.insertPayload).toEqual({
      account_id: ACCOUNT_A,
      resource_kind: "vehicle",
      source_provider: "motive",
      source_external_id: "motive-veh-88231",
      target_provider: "fleetio",
      target_external_id: "42",
      source_label: "Unit 104",
      target_label: "Truck 104",
      match_basis: "manual",
      created_by_user_id: USER_1,
      confirmed_by_user_id: USER_1,
      confirmed_at: CONFIRMED_AT,
    });
    expect(dto.accountId).toBe(ACCOUNT_A);
    expect(dto.targetExternalId).toBe("42");
  });

  it("nulls absent optional labels/provenance rather than omitting them", async () => {
    const state = setupRecording({ data: row({ source_label: null, target_label: null }), error: null });
    await createConfirmedLink({
      accountId: ACCOUNT_A,
      resourceKind: "vehicle",
      sourceProvider: "motive",
      sourceExternalId: "m-1",
      targetProvider: "fleetio",
      targetExternalId: "9",
      matchBasis: "suggested_vin",
      confirmedAt: CONFIRMED_AT,
    });
    expect(state.insertPayload).toMatchObject({
      source_label: null,
      target_label: null,
      created_by_user_id: null,
      confirmed_by_user_id: null,
    });
  });

  it.each([
    ["a blank source id", { sourceExternalId: "  " }],
    ["a blank target id", { targetExternalId: "" }],
    ["a blank provider", { sourceProvider: " " }],
    ["an unknown resource kind", { resourceKind: "trailer" }],
    ["an unknown match basis", { matchBasis: "suggested_colour" }],
    ["a non-uuid account id", { accountId: "not-a-uuid" }],
    ["a non-ISO confirmed_at", { confirmedAt: "yesterday" }],
    ["an over-long external id", { targetExternalId: "x".repeat(257) }],
    ["an unknown extra field (strict)", { hackedColumn: "boom" }],
  ])("rejects %s before touching the database", async (_label, over) => {
    const state = setupRecording({ data: row(), error: null });
    await expect(
      createConfirmedLink({ ...VALID_CREATE, ...(over as object) } as never),
    ).rejects.toThrow();
    expect(state.insertPayload).toBeUndefined();
    expect(getServiceRoleClientMock).not.toHaveBeenCalled();
  });

  it("rejects a self-link (same provider AND same id on both sides)", async () => {
    const state = setupRecording({ data: row(), error: null });
    await expect(
      createConfirmedLink({
        ...VALID_CREATE,
        sourceProvider: "fleetio",
        sourceExternalId: "42",
        targetProvider: "fleetio",
        targetExternalId: "42",
      }),
    ).rejects.toThrow(/two different resources/i);
    expect(state.insertPayload).toBeUndefined();
  });

  it("allows the same id string across two DIFFERENT providers", async () => {
    setupRecording({ data: row({ source_external_id: "42" }), error: null });
    await expect(
      createConfirmedLink({ ...VALID_CREATE, sourceExternalId: "42", targetExternalId: "42" }),
    ).resolves.toBeDefined();
  });
});

describe("account scoping — every query carries its account_id predicate", () => {
  it("listLinks filters on account_id AND resource_kind", async () => {
    const state = setupRecording({ data: [row()], error: null });
    await listLinks(ACCOUNT_A, "vehicle");
    expect(state.filters).toEqual(
      expect.arrayContaining([
        ["eq", "account_id", ACCOUNT_A],
        ["eq", "resource_kind", "vehicle"],
      ]),
    );
  });

  it("findActiveLink filters on the COMPLETE identity and excludes archived rows", async () => {
    const state = setupRecording({ data: row(), error: null });
    await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio");
    expect(state.filters).toEqual([
      ["eq", "account_id", ACCOUNT_A],
      ["eq", "resource_kind", "vehicle"],
      ["eq", "source_provider", "motive"],
      ["eq", "source_external_id", "motive-veh-88231"],
      ["eq", "target_provider", "fleetio"],
      ["is", "archived_at", null],
    ]);
  });

  it("archiveLink scopes by BOTH id and account_id, and only touches live rows", async () => {
    const state = setupRecording({ data: row({ archived_at: "T1" }), error: null });
    await archiveLink(ACCOUNT_A, "link-1", "T1");
    expect(state.filters).toEqual([
      ["eq", "id", "link-1"],
      ["eq", "account_id", ACCOUNT_A],
      ["is", "archived_at", null],
    ]);
    expect(state.updatePayload).toEqual({ archived_at: "T1" });
  });

  it("no exported operation can address a link by id alone", async () => {
    // Every mutating/reading entry point takes accountId as its FIRST argument.
    // archiveLink is the only id-addressed call, and it is account-scoped above.
    const repo = await import("@/repositories/resourceLinks/accountResourceLinks");
    expect(Object.keys(repo).sort()).toEqual(
      ["archiveLink", "createConfirmedLink", "findActiveLink", "listLinks"].sort(),
    );
  });
});

describe("cross-account isolation (in-memory predicate evaluation)", () => {
  it("account A cannot retrieve account B's link with an IDENTICAL source vehicle id", async () => {
    // Same Motive vehicle id in both accounts, different Fleetio targets — the
    // exact confusion that would send a meter reading to another company's truck.
    setupInMemory([
      row({ id: "a-link", account_id: ACCOUNT_A, target_external_id: "42" }),
      row({ id: "b-link", account_id: ACCOUNT_B, target_external_id: "999", target_label: "B Truck" }),
    ]);

    const forA = await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio");
    const forB = await findActiveLink(ACCOUNT_B, "vehicle", "motive", "motive-veh-88231", "fleetio");

    expect(forA?.targetExternalId).toBe("42");
    expect(forB?.targetExternalId).toBe("999");
    expect(forA?.id).not.toBe(forB?.id);
  });

  it("listLinks returns ONLY the requested account's links", async () => {
    setupInMemory([
      row({ id: "a-1", account_id: ACCOUNT_A }),
      row({ id: "a-2", account_id: ACCOUNT_A, source_external_id: "m-2", target_external_id: "43" }),
      row({ id: "b-1", account_id: ACCOUNT_B }),
    ]);
    const links = await listLinks(ACCOUNT_A, "vehicle");
    expect(links.map((l) => l.id).sort()).toEqual(["a-1", "a-2"]);
    expect(links.every((l) => l.accountId === ACCOUNT_A)).toBe(true);
  });

  it("account B cannot archive account A's link, and learns nothing from trying", async () => {
    const rows = setupInMemory([row({ id: "a-link", account_id: ACCOUNT_A })]);
    const result = await archiveLink(ACCOUNT_B, "a-link", "T1");

    // Null — indistinguishable from "no such link". No row leaked, nothing mutated.
    expect(result).toBeNull();
    expect(rows[0]!.archived_at).toBeNull();
  });

  it("a failed cross-account archive leaks no target id, label, or confirmer", async () => {
    setupInMemory([row({ id: "a-link", account_id: ACCOUNT_A })]);
    const result = await archiveLink(ACCOUNT_B, "a-link", "T1");
    const blob = JSON.stringify(result);
    expect(blob).not.toContain("42"); // target Fleetio id
    expect(blob).not.toContain("Truck 104"); // target label
    expect(blob).not.toContain("Unit 104"); // source label
    expect(blob).not.toContain(USER_1); // confirmer identity
  });

  it("a cross-account active lookup cannot confirm a row exists elsewhere", async () => {
    setupInMemory([row({ id: "a-link", account_id: ACCOUNT_A })]);
    // B asks for the very source id A has linked. Same answer as a vehicle that
    // was never linked by anyone: null.
    expect(
      await findActiveLink(ACCOUNT_B, "vehicle", "motive", "motive-veh-88231", "fleetio"),
    ).toBeNull();
    expect(
      await findActiveLink(ACCOUNT_B, "vehicle", "motive", "never-existed", "fleetio"),
    ).toBeNull();
  });
});

describe("archival lifecycle", () => {
  it("archiving removes the link from active lookup", async () => {
    const rows = setupInMemory([row({ id: "a-link" })]);
    expect(await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio")).not.toBeNull();

    await archiveLink(ACCOUNT_A, "a-link", "2026-07-25T00:00:00Z");
    expect(rows[0]!.archived_at).toBe("2026-07-25T00:00:00Z");
    expect(await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio")).toBeNull();
  });

  it("a re-link after archival resolves to the NEW target", async () => {
    const rows = setupInMemory([row({ id: "old", archived_at: "2026-07-25T00:00:00Z" })]);
    rows.push(row({ id: "new", target_external_id: "77", target_label: "Truck 77" }));

    const active = await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio");
    expect(active?.id).toBe("new");
    expect(active?.targetExternalId).toBe("77");
  });

  it("archiving twice is safe — the second call matches nothing and moves no timestamp", async () => {
    const rows = setupInMemory([row({ id: "a-link" })]);
    await archiveLink(ACCOUNT_A, "a-link", "T1");
    const second = await archiveLink(ACCOUNT_A, "a-link", "T2");
    expect(second).toBeNull();
    expect(rows[0]!.archived_at).toBe("T1");
  });

  it("listLinks still returns archived links (history is preserved)", async () => {
    setupInMemory([
      row({ id: "old", archived_at: "2026-07-25T00:00:00Z" }),
      row({ id: "live" }),
    ]);
    const links = await listLinks(ACCOUNT_A, "vehicle");
    expect(links.map((l) => l.id).sort()).toEqual(["live", "old"]);
    expect(links.find((l) => l.id === "old")!.archivedAt).toBe("2026-07-25T00:00:00Z");
  });
});

describe("provenance is returned but never used for lookup", () => {
  it("returns creator/confirmer on the DTO", async () => {
    setupRecording({ data: row(), error: null });
    const dto = await createConfirmedLink(VALID_CREATE);
    expect(dto.createdByUserId).toBe(USER_1);
    expect(dto.confirmedByUserId).toBe(USER_1);
    expect(dto.confirmedAt).toBe(CONFIRMED_AT);
  });

  it("no query filters on created_by_user_id or confirmed_by_user_id", async () => {
    const lookup = setupRecording({ data: row(), error: null });
    await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio");
    const list = setupRecording({ data: [row()], error: null });
    await listLinks(ACCOUNT_A, "vehicle");
    const archive = setupRecording({ data: row(), error: null });
    await archiveLink(ACCOUNT_A, "link-1", "T1");

    for (const state of [lookup, list, archive]) {
      const cols = state.filters.map((f) => f[1]);
      expect(cols).not.toContain("created_by_user_id");
      expect(cols).not.toContain("confirmed_by_user_id");
    }
  });

  it("a link whose users were deleted (null provenance) still resolves normally", async () => {
    setupInMemory([row({ created_by_user_id: null, confirmed_by_user_id: null })]);
    const active = await findActiveLink(ACCOUNT_A, "vehicle", "motive", "motive-veh-88231", "fleetio");
    expect(active).not.toBeNull();
    expect(active!.createdByUserId).toBeNull();
    expect(active!.confirmedByUserId).toBeNull();
  });
});

describe("DTO projection", () => {
  it("maps snake_case to camelCase and drops nothing the contract declares", async () => {
    setupInMemory([row()]);
    const dto = (await listLinks(ACCOUNT_A, "vehicle"))[0]!;
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id",
        "accountId",
        "resourceKind",
        "sourceProvider",
        "sourceExternalId",
        "targetProvider",
        "targetExternalId",
        "sourceLabel",
        "targetLabel",
        "matchBasis",
        "createdByUserId",
        "confirmedByUserId",
        "confirmedAt",
        "archivedAt",
        "createdAt",
        "updatedAt",
      ].sort(),
    );
  });

  it("never leaks raw snake_case DB keys onto the DTO", async () => {
    setupInMemory([row({ some_future_column: "should not surface" })]);
    const dto = (await listLinks(ACCOUNT_A, "vehicle"))[0]!;
    const blob = JSON.stringify(dto);
    expect(Object.keys(dto).some((k) => k.includes("_"))).toBe(false);
    expect(blob).not.toContain("should not surface");
  });

  it("selects an explicit column list, never SELECT *", async () => {
    const state = setupRecording({ data: [row()], error: null });
    await listLinks(ACCOUNT_A, "vehicle");
    expect(state.selectCols[0]).toContain("account_id");
    expect(state.selectCols[0]).not.toBe("*");
  });
});

describe("service-role client usage", () => {
  it("every operation requests the canonical client with an explicit, account-scoped reason", async () => {
    setupRecording({ data: [row()], error: null });
    await listLinks(ACCOUNT_A, "vehicle");
    setupRecording({ data: row(), error: null });
    await findActiveLink(ACCOUNT_A, "vehicle", "motive", "m-1", "fleetio");
    setupRecording({ data: row(), error: null });
    await createConfirmedLink(VALID_CREATE);
    setupRecording({ data: row(), error: null });
    await archiveLink(ACCOUNT_A, "link-1", "T1");

    const reasons = getServiceRoleClientMock.mock.calls.map((c) => String(c[0]));
    expect(reasons).toHaveLength(4);
    for (const reason of reasons) {
      expect(reason).toMatch(/^account_resource_links: /);
      expect(reason).toContain(ACCOUNT_A); // the reason names the tenant it acted for
    }
    expect(reasons.some((r) => r.includes("listLinks"))).toBe(true);
    expect(reasons.some((r) => r.includes("findActiveLink"))).toBe(true);
    expect(reasons.some((r) => r.includes("createConfirmedLink"))).toBe(true);
    expect(reasons.some((r) => r.includes("archiveLink"))).toBe(true);
  });
});

describe("error propagation", () => {
  it("surfaces a database error without inventing a row", async () => {
    setupRecording({ data: null, error: { message: "boom" } });
    await expect(listLinks(ACCOUNT_A, "vehicle")).rejects.toThrow(/listLinks failed/);
  });

  it("a duplicate active link (unique-index violation) propagates as an error", async () => {
    setupRecording({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });
    await expect(createConfirmedLink(VALID_CREATE)).rejects.toThrow(/createConfirmedLink failed/);
  });
});
