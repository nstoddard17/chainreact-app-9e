/**
 * @jest-environment node
 *
 * Tests for repositories/workflowNodeConnectorBindings.ts (CS-4a). Mocks the
 * service-role client to verify row payloads, snake_case translation, the
 * upsert onConflict key, the per-node filters, and the account-provider reject.
 * No DB — live RLS proofs would be a gated harness.
 */

interface ChainState {
  upsertPayload?: unknown;
  upsertOpts?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string; code?: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    upsert: jest.fn((p: unknown, opts: unknown) => {
      state.upsertPayload = p;
      state.upsertOpts = opts;
      return builder;
    }),
    delete: jest.fn(() => builder),
    select: jest.fn((cols?: string) => {
      state.filters.push({ op: "select", args: [cols ?? "*"] });
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
    order: jest.fn(() => builder),
    single: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
    maybeSingle: jest.fn(async () => ({ data: state.resultData, error: state.resultError })),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return { from: jest.fn(() => builder), state };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockServiceRole.current),
}));

import {
  getForNodeServiceRole,
  setForNodeServiceRole,
  deleteForNodeServiceRole,
  deleteForMemberInAccountServiceRole,
  listByWorkflowServiceRole,
  ACCOUNT_PROVIDER_NOT_BINDABLE,
} from "@/repositories/workflowNodeConnectorBindings";

const baseRow = {
  id: "bind-1",
  workflow_id: "wf-1",
  node_id: "node-7",
  provider: "gmail",
  connector_user_id: "conn-2",
  created_by_user_id: "user-1",
  created_at: "2026-06-12T00:00:00Z",
  updated_at: "2026-06-12T00:00:00Z",
};

function freshState(resultData: unknown): ChainState {
  return { filters: [], resultData, resultError: null };
}

describe("workflowNodeConnectorBindings repo", () => {
  it("setForNode UPSERTs with the (workflow_id,node_id) conflict key + snake_case payload", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const rec = await setForNodeServiceRole({
      workflowId: "wf-1", nodeId: "node-7", provider: "gmail", connectorUserId: "conn-2", createdByUserId: "user-1",
    });
    expect(rec.connectorUserId).toBe("conn-2");
    expect(state.upsertPayload).toMatchObject({
      workflow_id: "wf-1", node_id: "node-7", provider: "gmail", connector_user_id: "conn-2", created_by_user_id: "user-1",
    });
    expect(state.upsertOpts).toEqual({ onConflict: "workflow_id,node_id" });
  });

  it("setForNode REJECTS an account/service provider (no SQL write)", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    await expect(
      setForNodeServiceRole({ workflowId: "wf-1", nodeId: "n", provider: "slack", connectorUserId: "c", createdByUserId: "u" }),
    ).rejects.toThrow(ACCOUNT_PROVIDER_NOT_BINDABLE);
    expect(state.upsertPayload).toBeUndefined();
  });

  it("getForNode filters by workflow_id + node_id and maps the row", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const rec = await getForNodeServiceRole("wf-1", "node-7");
    expect(rec?.id).toBe("bind-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["node_id", "node-7"] });
  });

  it("getForNode returns null when no row", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    expect(await getForNodeServiceRole("wf-1", "node-x")).toBeNull();
  });

  it("deleteForNode filters by node and reports deleted:true when a row matched", async () => {
    const state = freshState([{ id: "bind-1" }]);
    mockServiceRole.current = makeMockClient(state);
    const res = await deleteForNodeServiceRole("wf-1", "node-7");
    expect(res).toEqual({ deleted: true });
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["node_id", "node-7"] });
  });

  it("deleteForNode reports deleted:false when nothing matched (idempotent)", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    expect(await deleteForNodeServiceRole("wf-1", "node-x")).toEqual({ deleted: false });
  });

  it("listByWorkflow filters by workflow_id and maps rows", async () => {
    const state = freshState([baseRow]);
    mockServiceRole.current = makeMockClient(state);
    const rows = await listByWorkflowServiceRole("wf-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nodeId).toBe("node-7");
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
  });

  it("propagates supabase errors", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: { message: "permission denied" } };
    mockServiceRole.current = makeMockClient(state);
    await expect(listByWorkflowServiceRole("wf-1")).rejects.toThrow(/permission denied/);
  });

  describe("deleteForMemberInAccountServiceRole (offboarding)", () => {
    it("scopes by account_id (via FK embed) + connector_user_id and deletes the matched ids", async () => {
      const state = freshState([{ id: "b1" }, { id: "b2" }]);
      mockServiceRole.current = makeMockClient(state);
      const res = await deleteForMemberInAccountServiceRole({ accountId: "acc-1", connectorUserId: "conn-2" });
      expect(res).toEqual({ deletedCount: 2 });
      expect(state.filters).toContainEqual({ op: "eq", args: ["workflows.account_id", "acc-1"] });
      expect(state.filters).toContainEqual({ op: "eq", args: ["connector_user_id", "conn-2"] });
      expect(state.filters).toContainEqual({ op: "in", args: ["id", ["b1", "b2"]] });
    });

    it("0 matches → no delete, deletedCount 0 (idempotent no-op)", async () => {
      const state = freshState([]);
      mockServiceRole.current = makeMockClient(state);
      const res = await deleteForMemberInAccountServiceRole({ accountId: "acc-1", connectorUserId: "nobody" });
      expect(res).toEqual({ deletedCount: 0 });
      expect(state.filters).not.toContainEqual({ op: "in", args: ["id", expect.anything()] });
    });
  });
});
