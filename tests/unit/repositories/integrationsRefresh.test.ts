/**
 * @jest-environment node
 *
 * Unit tests for repositories/integrationsRefresh (Phase 8 /
 * OAUTH-REFRESH-RELIABILITY-1) — the due-for-refresh selector and the
 * cross-instance claim/release. Mocked-builder pattern per
 * tests/unit/repositories/accounts.test.ts.
 *
 * The selector test is the query-shape proof the Phase 8 plan requires:
 * a healthy (unmarked) refreshable row whose token ALREADY expired IS
 * selected, and the exclusions (disconnected / needs-reconnect / no-expiry)
 * are all present as filters.
 */

interface ChainState {
  updatePayload?: unknown;
  selectColumns?: string;
  filters: Array<{ op: string; args: unknown[] }>;
  order?: { column: string; opts: unknown };
  limit?: number;
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    update: jest.fn((p: unknown) => {
      state.updatePayload = p;
      return builder;
    }),
    select: jest.fn((cols?: string) => {
      state.selectColumns = cols;
      return builder;
    }),
    eq: jest.fn((...args: unknown[]) => {
      state.filters.push({ op: "eq", args });
      return builder;
    }),
    is: jest.fn((...args: unknown[]) => {
      state.filters.push({ op: "is", args });
      return builder;
    }),
    not: jest.fn((...args: unknown[]) => {
      state.filters.push({ op: "not", args });
      return builder;
    }),
    lte: jest.fn((...args: unknown[]) => {
      state.filters.push({ op: "lte", args });
      return builder;
    }),
    or: jest.fn((...args: unknown[]) => {
      state.filters.push({ op: "or", args });
      return builder;
    }),
    order: jest.fn((column: string, opts: unknown) => {
      state.order = { column, opts };
      return builder;
    }),
    limit: jest.fn((n: number) => {
      state.limit = n;
      return builder;
    }),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  claimRefresh,
  listRefreshDueServiceRole,
  releaseRefreshClaim,
} from "@/repositories/integrationsRefresh";

function findFilter(state: ChainState, op: string, col: string) {
  return state.filters.find((f) => f.op === op && f.args[0] === col);
}

describe("listRefreshDueServiceRole", () => {
  it("selects healthy refreshable EXPIRED rows and applies every exclusion filter", async () => {
    const expiredIso = "2026-07-06T00:00:00+00:00"; // already past
    const state: ChainState = {
      filters: [],
      resultData: [
        {
          id: "int-1",
          account_id: "acct-1",
          provider: "gmail",
          provider_account_id: "alice@example.com",
          connected_by_user_id: "user-1",
          refresh_token_encrypted: "enc-cipher-blob",
          access_token_expires_at: expiredIso,
        },
      ],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);

    const cutoff = "2026-07-07T12:30:00.000Z";
    const rows = await listRefreshDueServiceRole({ dueBeforeIso: cutoff, limit: 200 });

    // The already-expired row IS returned (expired ≤ cutoff — the query has no
    // lower bound, so long-idle rows are recovered, not orphaned).
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "int-1",
      accountId: "acct-1",
      provider: "gmail",
      providerAccountId: "alice@example.com",
      connectedByUserId: "user-1",
      hasRefreshToken: true,
      accessTokenExpiresAt: expiredIso,
    });
    // Token-free DTO: the ciphertext never leaves the mapping.
    expect(JSON.stringify(rows)).not.toContain("enc-cipher-blob");

    // Exclusion filters all present.
    expect(findFilter(state, "is", "disconnected_at")).toBeTruthy();
    expect(findFilter(state, "is", "needs_reconnect_at")).toBeTruthy();
    expect(findFilter(state, "not", "access_token_expires_at")).toBeTruthy();
    const lte = findFilter(state, "lte", "access_token_expires_at");
    expect(lte?.args[1]).toBe(cutoff);
    expect(state.order?.column).toBe("access_token_expires_at");
    expect(state.limit).toBe(200);
  });

  it("maps a NULL refresh token to hasRefreshToken=false", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [
        {
          id: "int-2",
          account_id: "acct-1",
          provider: "gmail",
          provider_account_id: "bob@example.com",
          connected_by_user_id: null,
          refresh_token_encrypted: null,
          access_token_expires_at: "2026-07-07T00:00:00+00:00",
        },
      ],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);

    const rows = await listRefreshDueServiceRole({
      dueBeforeIso: "2026-07-07T12:30:00.000Z",
      limit: 10,
    });
    expect(rows[0]!.hasRefreshToken).toBe(false);
  });

  it("throws a clear error on a query failure", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "db down" },
    };
    mockServiceRole.current = makeMockClient(state);

    await expect(
      listRefreshDueServiceRole({ dueBeforeIso: "2026-07-07T12:30:00.000Z", limit: 10 }),
    ).rejects.toThrow(/listRefreshDueServiceRole failed: db down/);
  });
});

describe("claimRefresh", () => {
  it("takes the claim conditionally (active + no live claim / stale claim) and reports the win", async () => {
    const state: ChainState = {
      filters: [],
      resultData: [{ id: "int-1" }],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);

    const won = await claimRefresh({
      integrationId: "int-1",
      claimId: "claim-uuid-1",
      staleBeforeIso: "2026-07-07T11:59:00.000Z",
    });

    expect(won).toBe(true);
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload.refresh_claim_id).toBe("claim-uuid-1");
    expect(typeof payload.refresh_claimed_at).toBe("string");
    expect(findFilter(state, "eq", "id")?.args[1]).toBe("int-1");
    expect(findFilter(state, "is", "disconnected_at")).toBeTruthy();
    const orFilter = state.filters.find((f) => f.op === "or");
    expect(orFilter?.args[0]).toBe(
      "refresh_claim_id.is.null,refresh_claimed_at.lt.2026-07-07T11:59:00.000Z",
    );
  });

  it("reports a lost claim (zero rows matched) as false", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);

    const won = await claimRefresh({
      integrationId: "int-1",
      claimId: "claim-uuid-2",
      staleBeforeIso: "2026-07-07T11:59:00.000Z",
    });
    expect(won).toBe(false);
  });
});

describe("releaseRefreshClaim", () => {
  it("clears the claim only when guarded by its own claim id (TTL-steal safe)", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);

    await releaseRefreshClaim({ integrationId: "int-1", claimId: "claim-uuid-1" });

    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload).toEqual({ refresh_claim_id: null, refresh_claimed_at: null });
    expect(findFilter(state, "eq", "id")?.args[1]).toBe("int-1");
    expect(findFilter(state, "eq", "refresh_claim_id")?.args[1]).toBe("claim-uuid-1");
  });
});
