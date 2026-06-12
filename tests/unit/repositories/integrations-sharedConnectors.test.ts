/**
 * @jest-environment node
 *
 * Tests for repositories/integrations.listSharedConnectorUserIdsServiceRole
 * (Slice 4.CONN-SHARE / CS-3a). Asserts the query filters so DISCONNECTED and
 * UNSHARED rows are excluded by construction, selects ONLY connected_by_user_id
 * (no token/scope/metadata read), and returns a deduped, null-safe id set.
 */

interface ChainState {
  filters: Array<{ op: string; args: unknown[] }>;
  selected: string | null;
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn((cols: string) => {
      state.selected = cols;
      return builder;
    }),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    is: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "is", args: [col, val] });
      return builder;
    }),
    // The repo awaits the builder directly (list query, no maybeSingle) — make it thenable.
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.resultData, error: state.resultError }).then(onF, onR),
  });
  return { from: jest.fn(() => builder) };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import { listSharedConnectorUserIdsServiceRole } from "@/repositories/integrations";

function freshState(resultData: unknown): ChainState {
  return { filters: [], selected: null, resultData, resultError: null };
}

describe("listSharedConnectorUserIdsServiceRole", () => {
  it("filters account, provider, sharing_scope='shared_with_account', and disconnected_at IS NULL", async () => {
    const state = freshState([{ connected_by_user_id: "u1" }]);
    mockServiceRole.current = makeMockClient(state);
    await listSharedConnectorUserIdsServiceRole("acct-A", "gmail");

    expect(state.filters).toContainEqual({ op: "eq", args: ["account_id", "acct-A"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["provider", "gmail"] });
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["integration_sharing_scope", "shared_with_account"],
    });
    expect(state.filters).toContainEqual({ op: "is", args: ["disconnected_at", null] });
  });

  it("selects ONLY connected_by_user_id (no token/scope/metadata)", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    await listSharedConnectorUserIdsServiceRole("acct-A", "gmail");
    expect(state.selected).toBe("connected_by_user_id");
  });

  it("returns a deduped, null-safe set of distinct connector ids", async () => {
    const state = freshState([
      { connected_by_user_id: "u1" },
      { connected_by_user_id: "u1" }, // dup (two shared rows, same connector)
      { connected_by_user_id: "u2" },
      { connected_by_user_id: null }, // ignored
    ]);
    mockServiceRole.current = makeMockClient(state);
    const ids = await listSharedConnectorUserIdsServiceRole("acct-A", "gmail");
    expect([...ids].sort()).toEqual(["u1", "u2"]);
  });

  it("empty result ⇒ empty set", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    const ids = await listSharedConnectorUserIdsServiceRole("acct-A", "gmail");
    expect(ids.size).toBe(0);
  });

  it("propagates supabase errors", async () => {
    const state: ChainState = { filters: [], selected: null, resultData: null, resultError: { message: "permission denied" } };
    mockServiceRole.current = makeMockClient(state);
    await expect(listSharedConnectorUserIdsServiceRole("acct-A", "gmail")).rejects.toThrow(
      /permission denied/,
    );
  });
});
