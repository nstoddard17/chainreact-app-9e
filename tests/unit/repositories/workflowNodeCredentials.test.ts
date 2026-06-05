/**
 * @jest-environment node
 *
 * Tests for repositories/workflowNodeCredentials.ts (CS-1). Mocks the
 * service-role client to verify the row payloads, snake_case translation, the
 * status filters on the lifecycle transitions, and the provider/duplicate
 * guards. No DB — the live RLS/cascade/partial-unique proofs are the gated
 * harness (tests/integration/security/workflow-node-credentials-rls.test.ts).
 */

interface ChainState {
  insertPayload?: unknown;
  updatePayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  resultData: unknown;
  resultError: { message: string; code?: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    insert: jest.fn((p: unknown) => {
      state.insertPayload = p;
      return builder;
    }),
    update: jest.fn((p: unknown) => {
      state.updatePayload = p;
      return builder;
    }),
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
  listByWorkflowServiceRole,
  listAcceptedByWorkflowServiceRole,
  getForNodeServiceRole,
  createPendingRequestServiceRole,
  markAcceptedServiceRole,
  markDeclinedServiceRole,
  markRevokedServiceRole,
  ACCOUNT_PROVIDER_NOT_NODE_OWNABLE,
  DUPLICATE_LIVE_NODE_CREDENTIAL,
} from "@/repositories/workflowNodeCredentials";

const baseRow = {
  id: "grant-1",
  workflow_id: "wf-1",
  node_id: "node-7",
  provider: "gmail",
  credential_owner_user_id: "user-2",
  status: "pending" as const,
  requested_by_user_id: "user-1",
  requested_at: "2026-06-06T00:00:00Z",
  decided_at: null,
  created_at: "2026-06-06T00:00:00Z",
  updated_at: "2026-06-06T00:00:00Z",
};

describe("workflowNodeCredentials.createPendingRequest", () => {
  it("INSERTs a pending grant with snake_case translation for a personal provider", async () => {
    const state: ChainState = { filters: [], resultData: baseRow, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const result = await createPendingRequestServiceRole({
      workflowId: "wf-1",
      nodeId: "node-7",
      provider: "gmail",
      credentialOwnerUserId: "user-2",
      requestedByUserId: "user-1",
    });
    expect(state.insertPayload).toMatchObject({
      workflow_id: "wf-1",
      node_id: "node-7",
      provider: "gmail",
      credential_owner_user_id: "user-2",
      requested_by_user_id: "user-1",
      status: "pending",
    });
    expect(result.id).toBe("grant-1");
    expect(result.credentialOwnerUserId).toBe("user-2");
  });

  it("REJECTS an account/service provider before any DB call", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      createPendingRequestServiceRole({
        workflowId: "wf-1",
        nodeId: "node-7",
        provider: "slack",
        credentialOwnerUserId: "user-2",
        requestedByUserId: "user-1",
      }),
    ).rejects.toThrow(ACCOUNT_PROVIDER_NOT_NODE_OWNABLE);
    // No insert attempted.
    expect(state.insertPayload).toBeUndefined();
  });

  it("maps the partial-unique violation (23505) to DUPLICATE_LIVE_NODE_CREDENTIAL", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "duplicate key", code: "23505" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      createPendingRequestServiceRole({
        workflowId: "wf-1",
        nodeId: "node-7",
        provider: "gmail",
        credentialOwnerUserId: "user-2",
        requestedByUserId: "user-1",
      }),
    ).rejects.toThrow(DUPLICATE_LIVE_NODE_CREDENTIAL);
  });
});

describe("workflowNodeCredentials reads", () => {
  it("listByWorkflow filters by workflow_id (any status)", async () => {
    const state: ChainState = { filters: [], resultData: [baseRow], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const rows = await listByWorkflowServiceRole("wf-1");
    expect(rows).toHaveLength(1);
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
    // does NOT constrain status
    expect(state.filters).not.toContainEqual({ op: "eq", args: ["status", "accepted"] });
  });

  it("listAcceptedByWorkflow filters status = accepted", async () => {
    const state: ChainState = { filters: [], resultData: [], resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await listAcceptedByWorkflowServiceRole("wf-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "accepted"] });
  });

  it("getForNode returns the single LIVE (pending|accepted) grant", async () => {
    const state: ChainState = { filters: [], resultData: baseRow, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    const row = await getForNodeServiceRole("wf-1", "node-7");
    expect(row?.id).toBe("grant-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["workflow_id", "wf-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["node_id", "node-7"] });
    expect(state.filters).toContainEqual({ op: "in", args: ["status", ["pending", "accepted"]] });
  });

  it("getForNode returns null when there is no live grant", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    expect(await getForNodeServiceRole("wf-1", "node-9")).toBeNull();
  });
});

describe("workflowNodeCredentials status transitions", () => {
  it("markAccepted updates pending → accepted + decided_at", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await markAcceptedServiceRole("grant-1", "2026-06-06T01:00:00Z");
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("accepted");
    expect(payload.decided_at).toBe("2026-06-06T01:00:00Z");
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "grant-1"] });
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "pending"] });
  });

  it("markDeclined updates pending → declined", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await markDeclinedServiceRole("grant-1", "2026-06-06T01:00:00Z");
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("declined");
    expect(state.filters).toContainEqual({ op: "eq", args: ["status", "pending"] });
  });

  it("markRevoked updates a LIVE (pending|accepted) grant → revoked", async () => {
    const state: ChainState = { filters: [], resultData: null, resultError: null };
    mockServiceRole.current = makeMockClient(state);
    await markRevokedServiceRole("grant-1", "2026-06-06T02:00:00Z");
    const payload = state.updatePayload as Record<string, unknown>;
    expect(payload.status).toBe("revoked");
    expect(state.filters).toContainEqual({ op: "in", args: ["status", ["pending", "accepted"]] });
  });

  it("propagates Supabase update errors", async () => {
    const state: ChainState = {
      filters: [],
      resultData: null,
      resultError: { message: "boom" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(markAcceptedServiceRole("grant-1", "2026-06-06T01:00:00Z")).rejects.toThrow(/boom/);
  });
});
