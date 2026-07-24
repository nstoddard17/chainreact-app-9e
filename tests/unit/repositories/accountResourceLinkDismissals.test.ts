/**
 * @jest-environment node
 *
 * Tests for repositories/resourceLinks/accountResourceLinkDismissals.ts
 * (5.TRUCK-BRIDGE-1 CS-5). No DB.
 *
 * Two harnesses, mirroring the CS-1 link-repository suite:
 *
 *   1. A RECORDING client that captures the exact filters + payload, so we can
 *      prove every query carries its `account_id` predicate and the insert
 *      writes only approved columns.
 *   2. A small IN-MEMORY table that actually EVALUATES `eq` / `is` predicates,
 *      so isolation and archival exclusion are proven as SEMANTICS rather than
 *      as recorded filter calls.
 *
 * The service role BYPASSES RLS, so these `account_id` predicates ARE the tenant
 * boundary for every call in this repository — which is what makes harness 2 a
 * security test rather than a formality.
 */
import { CreateResourceLinkDismissalInputSchema } from "@/contracts/resourceLinkDismissals";

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
}

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

type Row = Record<string, unknown>;

function makeInMemoryClient(rows: Row[]) {
  return {
    from: () => {
      const preds: Array<(r: Row) => boolean> = [];
      let mode: "select" | "update" | "insert" = "select";
      let payload: Row = {};
      const b: Record<string, unknown> = {};
      const matching = () => rows.filter((r) => preds.every((p) => p(r)));
      const finish = (): Result => {
        if (mode === "update") {
          const hits = matching();
          for (const r of hits) Object.assign(r, payload);
          return { data: hits.length > 0 ? { ...hits[0] } : null, error: null };
        }
        if (mode === "insert") {
          rows.push({ ...payload });
          return { data: { ...payload }, error: null };
        }
        return { data: matching().map((r) => ({ ...r })), error: null };
      };
      Object.assign(b, {
        insert: (p: Row) => ((mode = "insert"), (payload = p), b),
        update: (p: Row) => ((mode = "update"), (payload = p), b),
        select: () => b,
        eq: (col: string, v: unknown) => (preds.push((r) => r[col] === v), b),
        is: (col: string, v: unknown) => (preds.push((r) => r[col] === v), b),
        order: () => b,
        single: async () => finish(),
        maybeSingle: async () => finish(),
        then: (resolve: (v: Result) => void) => resolve(finish()),
      });
      return b;
    },
  };
}

const mockClient = jest.fn();
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (...a: unknown[]) => mockClient(...a),
}));

import {
  listActiveDismissals,
  createDismissal,
  archiveDismissalForPair,
} from "@/repositories/resourceLinks/accountResourceLinkDismissals";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const AT = "2026-07-24T12:00:00.000Z";

function row(over: Row = {}): Row {
  return {
    id: "dis-1",
    account_id: ACCOUNT_A,
    resource_kind: "vehicle",
    source_provider: "motive",
    source_external_id: "motive-1",
    target_provider: "fleetio",
    target_external_id: "42",
    match_tier: "name",
    evidence_fingerprint: 'name|Unit 104 appears in "Truck 104"',
    dismissed_by_user_id: USER,
    dismissed_at: AT,
    archived_at: null,
    created_at: AT,
    updated_at: AT,
    ...over,
  };
}

function input(over: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_A,
    resourceKind: "vehicle" as const,
    sourceProvider: "motive",
    sourceExternalId: "motive-1",
    targetProvider: "fleetio",
    targetExternalId: "42",
    matchTier: "name" as const,
    evidenceFingerprint: 'name|Unit 104 appears in "Truck 104"',
    dismissedByUserId: USER,
    dismissedAt: AT,
    ...over,
  };
}

beforeEach(() => mockClient.mockReset());

describe("every query carries its account_id predicate", () => {
  it("listActiveDismissals filters account + kind + not-archived", async () => {
    const state: State = { selectCols: [], filters: [], result: { data: [], error: null } };
    mockClient.mockReturnValue(makeRecordingClient(state));
    await listActiveDismissals(ACCOUNT_A, "vehicle");
    expect(state.filters).toEqual([
      ["eq", "account_id", ACCOUNT_A],
      ["eq", "resource_kind", "vehicle"],
      ["is", "archived_at", null],
    ]);
    expect(state.selectCols[0]).not.toBe("*");
  });

  it("archiveDismissalForPair filters the FULL pair + account + not-archived", async () => {
    const state: State = { selectCols: [], filters: [], result: { data: null, error: null } };
    mockClient.mockReturnValue(makeRecordingClient(state));
    await archiveDismissalForPair(
      ACCOUNT_A, "vehicle", "motive", "motive-1", "fleetio", "42", AT,
    );
    expect(state.filters).toEqual([
      ["eq", "account_id", ACCOUNT_A],
      ["eq", "resource_kind", "vehicle"],
      ["eq", "source_provider", "motive"],
      ["eq", "source_external_id", "motive-1"],
      ["eq", "target_provider", "fleetio"],
      ["eq", "target_external_id", "42"],
      ["is", "archived_at", null],
    ]);
    expect(state.updatePayload).toEqual({ archived_at: AT });
  });

  it("createDismissal writes ONLY the approved columns", async () => {
    const state: State = { selectCols: [], filters: [], result: { data: row(), error: null } };
    mockClient.mockReturnValue(makeRecordingClient(state));
    await createDismissal(input());
    expect(Object.keys(state.insertPayload!).sort()).toEqual([
      "account_id",
      "dismissed_at",
      "dismissed_by_user_id",
      "evidence_fingerprint",
      "match_tier",
      "resource_kind",
      "source_external_id",
      "source_provider",
      "target_external_id",
      "target_provider",
    ]);
    // No id, no archived_at, no timestamps — the DB owns those.
    expect(state.insertPayload).not.toHaveProperty("id");
    expect(state.insertPayload).not.toHaveProperty("archived_at");
  });
});

describe("contract validation happens before the DB", () => {
  it("rejects a self-referential dismissal", () => {
    expect(() =>
      CreateResourceLinkDismissalInputSchema.parse(
        input({ targetProvider: "motive", targetExternalId: "motive-1" }),
      ),
    ).toThrow(/two different resources/i);
  });

  it("rejects a blank / over-long fingerprint and an unknown tier", () => {
    for (const bad of [
      input({ evidenceFingerprint: "   " }),
      input({ evidenceFingerprint: "x".repeat(513) }),
      input({ matchTier: "vibes" }),
    ]) {
      expect(() => CreateResourceLinkDismissalInputSchema.parse(bad)).toThrow();
    }
  });

  it("rejects an unknown key (strict)", () => {
    expect(() =>
      CreateResourceLinkDismissalInputSchema.parse(input({ linkId: "sneaky" })),
    ).toThrow();
  });
});

describe("semantics — isolation and archival, evaluated for real", () => {
  it("account A never reads account B's dismissal", async () => {
    const rows = [row({ id: "a" }), row({ id: "b", account_id: ACCOUNT_B })];
    mockClient.mockReturnValue(makeInMemoryClient(rows));
    const a = await listActiveDismissals(ACCOUNT_A, "vehicle");
    expect(a.map((d) => d.id)).toEqual(["a"]);
  });

  it("an ARCHIVED dismissal disappears from the active list", async () => {
    const rows = [row({ id: "a", archived_at: "2026-07-25T00:00:00Z" })];
    mockClient.mockReturnValue(makeInMemoryClient(rows));
    expect(await listActiveDismissals(ACCOUNT_A, "vehicle")).toEqual([]);
  });

  it("archiving another account's pair matches nothing and mutates nothing", async () => {
    const rows = [row({ id: "a" })];
    mockClient.mockReturnValue(makeInMemoryClient(rows));
    const result = await archiveDismissalForPair(
      ACCOUNT_B, "vehicle", "motive", "motive-1", "fleetio", "42", AT,
    );
    expect(result).toBeNull();
    expect(rows[0]!.archived_at).toBeNull();
  });

  it("archiving the OWN pair sets archived_at once; a second call matches nothing", async () => {
    const rows = [row({ id: "a" })];
    mockClient.mockReturnValue(makeInMemoryClient(rows));
    const first = await archiveDismissalForPair(
      ACCOUNT_A, "vehicle", "motive", "motive-1", "fleetio", "42", AT,
    );
    expect(first).not.toBeNull();
    expect(rows[0]!.archived_at).toBe(AT);

    const second = await archiveDismissalForPair(
      ACCOUNT_A, "vehicle", "motive", "motive-1", "fleetio", "42", "2026-08-01T00:00:00.000Z",
    );
    expect(second).toBeNull();
    expect(rows[0]!.archived_at).toBe(AT);
  });
});

describe("DTO projection", () => {
  it("maps every column and leaks no raw row shape", async () => {
    mockClient.mockReturnValue(makeInMemoryClient([row()]));
    const [dto] = await listActiveDismissals(ACCOUNT_A, "vehicle");
    expect(Object.keys(dto!).sort()).toEqual([
      "accountId",
      "archivedAt",
      "createdAt",
      "dismissedAt",
      "dismissedByUserId",
      "evidenceFingerprint",
      "id",
      "matchTier",
      "resourceKind",
      "sourceExternalId",
      "sourceProvider",
      "targetExternalId",
      "targetProvider",
      "updatedAt",
    ]);
    // Snake_case row keys never escape.
    expect(dto).not.toHaveProperty("account_id");
    expect(dto).not.toHaveProperty("evidence_fingerprint");
  });
});

describe("errors surface as thrown, not silent nulls", () => {
  it("listActiveDismissals throws on a query error", async () => {
    const state: State = {
      selectCols: [],
      filters: [],
      result: { data: null, error: { message: "boom" } },
    };
    mockClient.mockReturnValue(makeRecordingClient(state));
    await expect(listActiveDismissals(ACCOUNT_A, "vehicle")).rejects.toThrow(/listActiveDismissals failed/);
  });

  it("createDismissal throws when no row comes back", async () => {
    const state: State = { selectCols: [], filters: [], result: { data: null, error: null } };
    mockClient.mockReturnValue(makeRecordingClient(state));
    await expect(createDismissal(input())).rejects.toThrow(/createDismissal failed/);
  });
});
