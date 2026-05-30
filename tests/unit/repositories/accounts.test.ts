/**
 * @jest-environment node
 *
 * Slice 4.ACCOUNT-MODEL-3 — unit tests for `repositories/accounts.ts`.
 *
 * Mocks both Supabase clients (SSR-cookie for session reads; service-role
 * for the ensure helper) and asserts payload shape + idempotency of
 * `ensurePersonalAccountServiceRole`. Per the same mocked-builder pattern
 * used by `tests/unit/repositories/notifications.test.ts`.
 */

interface ChainState {
  insertPayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    insert: jest.fn((p: unknown) => {
      state.insertPayload = p;
      return builder;
    }),
    select: jest.fn(() => builder),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    single: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
    maybeSingle: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockSSR: { current: ReturnType<typeof makeMockClient> | null } = { current: null };
const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = { current: null };

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  getById,
  getPersonalAccountForUser,
  ensurePersonalAccountServiceRole,
} from "@/repositories/accounts";

const baseAccountRow = {
  id: "acct-1",
  type: "personal" as const,
  name: "Personal",
  owner_user_id: "user-1",
  created_at: "2026-05-30T00:00:00Z",
  updated_at: "2026-05-30T00:00:00Z",
};

describe("accounts.getById", () => {
  it("returns the mapped record when the row exists", async () => {
    mockSSR.current = makeMockClient({
      filters: [],
      resultData: baseAccountRow,
      resultError: null,
    });
    const result = await getById("acct-1");
    expect(result).toEqual({
      id: "acct-1",
      type: "personal",
      name: "Personal",
      ownerUserId: "user-1",
      createdAt: "2026-05-30T00:00:00Z",
      updatedAt: "2026-05-30T00:00:00Z",
    });
    expect(mockSSR.current!.state.filters).toContainEqual({
      op: "eq",
      args: ["id", "acct-1"],
    });
  });

  it("returns null when no row exists", async () => {
    mockSSR.current = makeMockClient({
      filters: [],
      resultData: null,
      resultError: null,
    });
    const result = await getById("missing");
    expect(result).toBeNull();
  });

  it("throws on DB error", async () => {
    mockSSR.current = makeMockClient({
      filters: [],
      resultData: null,
      resultError: { message: "boom" },
    });
    await expect(getById("acct-1")).rejects.toThrow(/getById failed: boom/);
  });
});

describe("accounts.getPersonalAccountForUser", () => {
  it("queries by (type=personal, owner_user_id=userId) and returns the record", async () => {
    mockSSR.current = makeMockClient({
      filters: [],
      resultData: baseAccountRow,
      resultError: null,
    });
    const result = await getPersonalAccountForUser("user-1");
    expect(result?.ownerUserId).toBe("user-1");
    const filters = mockSSR.current!.state.filters;
    expect(filters).toContainEqual({ op: "eq", args: ["type", "personal"] });
    expect(filters).toContainEqual({ op: "eq", args: ["owner_user_id", "user-1"] });
  });

  it("returns null when the user has no personal account row", async () => {
    mockSSR.current = makeMockClient({
      filters: [],
      resultData: null,
      resultError: null,
    });
    const result = await getPersonalAccountForUser("user-missing");
    expect(result).toBeNull();
  });
});

describe("accounts.ensurePersonalAccountServiceRole", () => {
  it("returns the existing row when one exists (no insert)", async () => {
    const state: ChainState = {
      filters: [],
      resultData: baseAccountRow,
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);
    const result = await ensurePersonalAccountServiceRole("user-1");
    expect(result.ownerUserId).toBe("user-1");
    expect(state.insertPayload).toBeUndefined();
  });

  it("inserts the account + the owner membership when missing", async () => {
    // First SELECT returns null (no existing account). Subsequent INSERT
    // for the account row returns the new row. Subsequent INSERT for the
    // membership returns null with no error. We model this by swapping the
    // mock client's state across the three calls.
    let callIndex = 0;
    const states: ChainState[] = [
      { filters: [], resultData: null, resultError: null },        // SELECT existing
      { filters: [], resultData: baseAccountRow, resultError: null }, // INSERT account
      { filters: [], resultData: null, resultError: null },        // INSERT membership
    ];
    const fromFn = jest.fn(() => {
      const state = states[callIndex]!;
      callIndex += 1;
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        insert: jest.fn((p: unknown) => {
          state.insertPayload = p;
          return builder;
        }),
        select: jest.fn(() => builder),
        eq: jest.fn((col: string, val: unknown) => {
          state.filters.push({ op: "eq", args: [col, val] });
          return builder;
        }),
        single: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
        maybeSingle: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: state.resultData, error: state.resultError }),
      });
      return builder;
    });
    mockServiceRole.current = { from: fromFn, state: states[0]! } as ReturnType<
      typeof makeMockClient
    >;
    const result = await ensurePersonalAccountServiceRole("user-1");
    expect(result.ownerUserId).toBe("user-1");
    // States[1] is the account INSERT.
    expect(states[1]!.insertPayload).toEqual({
      type: "personal",
      name: "Personal",
      owner_user_id: "user-1",
    });
    // States[2] is the membership INSERT.
    expect(states[2]!.insertPayload).toEqual({
      account_id: baseAccountRow.id,
      user_id: "user-1",
      role: "owner",
    });
  });

  it("throws when the membership INSERT fails (signals the personal-invariant violated)", async () => {
    let callIndex = 0;
    const states: ChainState[] = [
      { filters: [], resultData: null, resultError: null },
      { filters: [], resultData: baseAccountRow, resultError: null },
      { filters: [], resultData: null, resultError: { message: "account_memberships_personal_invariant_violation: …" } },
    ];
    const fromFn = jest.fn(() => {
      const state = states[callIndex]!;
      callIndex += 1;
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        insert: jest.fn((p: unknown) => {
          state.insertPayload = p;
          return builder;
        }),
        select: jest.fn(() => builder),
        eq: jest.fn((c: string, v: unknown) => {
          state.filters.push({ op: "eq", args: [c, v] });
          return builder;
        }),
        single: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
        maybeSingle: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: state.resultData, error: state.resultError }),
      });
      return builder;
    });
    mockServiceRole.current = { from: fromFn, state: states[0]! } as ReturnType<
      typeof makeMockClient
    >;
    await expect(ensurePersonalAccountServiceRole("user-1")).rejects.toThrow(
      /membership insert failed/,
    );
  });
});
