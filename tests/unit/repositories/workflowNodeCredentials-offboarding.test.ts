/**
 * @jest-environment node
 *
 * Tests for the CS-6 offboarding repo helpers in
 * repositories/workflowNodeCredentials.ts:
 *   - listAcceptedOwnedByUserInAccountServiceRole (impact)
 *   - revokeLiveForMemberServiceRole (remove / leave)
 *
 * Mocks the service-role client to verify the account-scoping FK embed, the
 * owner + status filters, the select-then-revoke-by-id sequence, the live-status
 * guard on the UPDATE, and the 0-row no-op short-circuit. No DB — the live
 * RLS/cascade proofs are the gated harness
 * (tests/integration/security/workflow-node-credentials-rls.test.ts).
 */

interface Stage {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface ChainState {
  updatePayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  selectCols: string[];
  /** FIFO of awaited results — one per terminal `then` (select, then update). */
  stages: Stage[];
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  function resolveStage() {
    return state.stages.shift() ?? { data: null, error: null };
  }
  Object.assign(builder, {
    update: jest.fn((p: unknown) => {
      state.updatePayload = p;
      return builder;
    }),
    select: jest.fn((cols?: string) => {
      state.selectCols.push(cols ?? "*");
      return builder;
    }),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    in: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "in", args: [col, val] });
      return builder;
    }),
    then: (resolve: (v: unknown) => void) => resolve(resolveStage()),
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
  listAcceptedOwnedByUserInAccountServiceRole,
  revokeLiveForMemberServiceRole,
} from "@/repositories/workflowNodeCredentials";

const ACCOUNT = "acct-1";
const OWNER = "user-2";

function ownedRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "grant-1",
    workflow_id: "wf-1",
    node_id: "node-7",
    provider: "gmail",
    credential_owner_user_id: OWNER,
    status: "accepted" as const,
    requested_by_user_id: "user-1",
    requested_at: "2026-06-06T00:00:00Z",
    decided_at: "2026-06-06T01:00:00Z",
    created_at: "2026-06-06T00:00:00Z",
    updated_at: "2026-06-06T00:00:00Z",
    // The FK embed returns a nested object; rowToRecord must ignore it.
    workflows: { account_id: ACCOUNT },
    ...over,
  };
}

describe("listAcceptedOwnedByUserInAccountServiceRole", () => {
  it("scopes by the account FK embed + owner + status=accepted, mapping to records", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [{ data: [ownedRow(), ownedRow({ id: "grant-2", workflow_id: "wf-2" })], error: null }],
    };
    mockServiceRole.current = makeMockClient(state);

    const rows = await listAcceptedOwnedByUserInAccountServiceRole(ACCOUNT, OWNER);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "grant-1", workflowId: "wf-1", credentialOwnerUserId: OWNER });
    // The nested embed object never bleeds into the mapped record.
    expect((rows[0] as unknown as Record<string, unknown>).workflows).toBeUndefined();
    // Account-scoping is via the inner FK embed on workflows.account_id.
    expect(state.selectCols).toContainEqual("*, workflows!inner(account_id)");
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflows.account_id", ACCOUNT] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["credential_owner_user_id", OWNER] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "accepted"] });
  });

  it("returns [] when the member owns no accepted grants", async () => {
    const state: ChainState = { filters: [], selectCols: [], stages: [{ data: [], error: null }] };
    mockServiceRole.current = makeMockClient(state);
    expect(await listAcceptedOwnedByUserInAccountServiceRole(ACCOUNT, OWNER)).toEqual([]);
  });

  it("propagates a Supabase error", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [{ data: null, error: { message: "boom" } }],
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      listAcceptedOwnedByUserInAccountServiceRole(ACCOUNT, OWNER),
    ).rejects.toThrow(/boom/);
  });
});

describe("revokeLiveForMemberServiceRole", () => {
  it("resolves in-account live grant ids, then revokes them by id under the live-status guard", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [
        // 1) select live ids (pending|accepted) for this owner, account-scoped
        { data: [{ id: "grant-1" }, { id: "grant-2" }], error: null },
        // 2) update ... returning the revoked rows via .select("id")
        { data: [{ id: "grant-1" }, { id: "grant-2" }], error: null },
      ],
    };
    mockServiceRole.current = makeMockClient(state);

    const result = await revokeLiveForMemberServiceRole({
      accountId: ACCOUNT,
      credentialOwnerUserId: OWNER,
      now: "2026-06-07T00:00:00Z",
    });

    expect(result).toEqual({ revokedCount: 2 });
    // Account-scoping + owner + live-status on the SELECT.
    expect(state.selectCols).toContainEqual("id, workflows!inner(account_id)");
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflows.account_id", ACCOUNT] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["credential_owner_user_id", OWNER] });
    expect(state.filters).toContainEqual({ op: "in", args: ["status", ["pending", "accepted"]] });
    // The UPDATE sets revoked + the supplied decided_at, by id, with the guard.
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("revoked");
    expect(payload.decided_at).toBe("2026-06-07T00:00:00Z");
    expect(state.filters).toContainEqual({ op: "in", args: ["id", ["grant-1", "grant-2"]] });
    // Guard appears twice (once on select, once on update).
    expect(
      state.filters.filter(
        (f) => f.op === "in" && f.args[0] === "status",
      ),
    ).toHaveLength(2);
  });

  it("no-ops (no UPDATE) when the member owns no live grants", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [{ data: [], error: null }],
    };
    mockServiceRole.current = makeMockClient(state);

    const result = await revokeLiveForMemberServiceRole({
      accountId: ACCOUNT,
      credentialOwnerUserId: OWNER,
    });

    expect(result).toEqual({ revokedCount: 0 });
    // No UPDATE attempted.
    expect(state.updatePayload).toBeUndefined();
  });

  it("returns the rows actually revoked when the guard skips a concurrently-changed grant", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [
        { data: [{ id: "grant-1" }, { id: "grant-2" }], error: null },
        // grant-2 changed status between select and update → only grant-1 revoked
        { data: [{ id: "grant-1" }], error: null },
      ],
    };
    mockServiceRole.current = makeMockClient(state);

    const result = await revokeLiveForMemberServiceRole({
      accountId: ACCOUNT,
      credentialOwnerUserId: OWNER,
    });
    expect(result).toEqual({ revokedCount: 1 });
  });

  it("propagates a select error before any UPDATE", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [{ data: null, error: { message: "select boom" } }],
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      revokeLiveForMemberServiceRole({ accountId: ACCOUNT, credentialOwnerUserId: OWNER }),
    ).rejects.toThrow(/select boom/);
    expect(state.updatePayload).toBeUndefined();
  });

  it("propagates an update error", async () => {
    const state: ChainState = {
      filters: [],
      selectCols: [],
      stages: [
        { data: [{ id: "grant-1" }], error: null },
        { data: null, error: { message: "update boom" } },
      ],
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      revokeLiveForMemberServiceRole({ accountId: ACCOUNT, credentialOwnerUserId: OWNER }),
    ).rejects.toThrow(/update boom/);
  });
});
