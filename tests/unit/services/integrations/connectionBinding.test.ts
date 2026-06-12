/**
 * @jest-environment node
 *
 * Tests for the CS-4a node connector binding service
 * (services/integrations/connectionBinding). The pure classifier runs for real;
 * repos + membership + flag are mocked. Covers: flag gate, the resolve/authz
 * matrix, account/native rejection, the connector validation chain (member →
 * connected → shared) incl. the no-silent-share fence, the fail-closed lifecycle
 * (unshared/disconnected ⇒ rejected), the safe picker, list, and no-leak.
 */
const mockGetWf = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockIsMember = jest.fn();
const mockGetActive = jest.fn();
const mockListShared = jest.fn();
const mockSetForNode = jest.fn();
const mockDeleteForNode = jest.fn();
const mockListByWorkflow = jest.fn();
const mockListMembers = jest.fn();
const mockFlag = jest.fn();

jest.mock("@/repositories/workflows", () => ({ getByIdServiceRole: (...a: unknown[]) => mockGetWf(...a) }));
jest.mock("@/repositories/accounts", () => ({ getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a) }));
jest.mock("@/repositories/accountMemberships", () => ({ isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a) }));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  listSharedConnectorUserIdsServiceRole: (...a: unknown[]) => mockListShared(...a),
}));
jest.mock("@/repositories/workflowNodeConnectorBindings", () => ({
  setForNodeServiceRole: (...a: unknown[]) => mockSetForNode(...a),
  deleteForNodeServiceRole: (...a: unknown[]) => mockDeleteForNode(...a),
  listByWorkflowServiceRole: (...a: unknown[]) => mockListByWorkflow(...a),
}));
jest.mock("@/services/accounts/membership", () => ({ listMembers: (...a: unknown[]) => mockListMembers(...a) }));
jest.mock("@/services/integrations/connectionSharingFlags", () => ({ isConnectionSharingEnabled: () => mockFlag() }));

import {
  setNodeConnectorBinding,
  clearNodeConnectorBinding,
  listEligibleSharedConnectors,
  listWorkflowConnectorBindings,
} from "@/services/integrations/connectionBinding";

const ACCOUNT = "acc-1";
const CREATOR = "creator-1";
const CONNECTOR = "connector-9";

function wf(over: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    accountId: ACCOUNT,
    createdByUserId: CREATOR,
    state: "active",
    draftDefinition: { nodes: [{ id: "node-7", provider: "gmail" }], edges: [] },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  mockGetWf.mockResolvedValue(wf());
  mockGetDeletionStatus.mockResolvedValue("active");
  mockIsMember.mockResolvedValue(true);
  mockGetActive.mockResolvedValue({ id: "int-1" }); // active connection present
  mockListShared.mockResolvedValue(new Set([CONNECTOR]));
  mockSetForNode.mockResolvedValue({});
  mockDeleteForNode.mockResolvedValue({ deleted: true });
});

const setArgs = (over = {}) => ({
  workflowId: "wf-1", nodeId: "node-7", connectorUserId: CONNECTOR, callerUserId: CREATOR, callerRole: "member" as const, ...over,
});

describe("setNodeConnectorBinding — flag + resolve gate", () => {
  it("flag OFF ⇒ not_enabled, no reads/writes", async () => {
    mockFlag.mockReturnValue(false);
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "not_enabled" });
    expect(mockGetWf).not.toHaveBeenCalled();
    expect(mockSetForNode).not.toHaveBeenCalled();
  });
  it("missing/deleted workflow ⇒ workflow_not_found", async () => {
    mockGetWf.mockResolvedValue(null);
    expect((await setNodeConnectorBinding(setArgs())).ok).toBe(false);
    mockGetWf.mockResolvedValue(wf({ state: "deleted" }));
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "workflow_not_found" });
  });
  it("unknown node ⇒ node_not_found", async () => {
    expect(await setNodeConnectorBinding(setArgs({ nodeId: "nope" }))).toEqual({ ok: false, reason: "node_not_found" });
  });
  it("account provider node ⇒ not_applicable", async () => {
    mockGetWf.mockResolvedValue(wf({ draftDefinition: { nodes: [{ id: "node-7", provider: "slack" }], edges: [] } }));
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "not_applicable" });
  });
  it("native node ⇒ not_applicable", async () => {
    mockGetWf.mockResolvedValue(wf({ draftDefinition: { nodes: [{ id: "node-7", provider: "native" }], edges: [] } }));
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "not_applicable" });
  });
  it("frozen account ⇒ account_frozen", async () => {
    mockGetDeletionStatus.mockResolvedValue("pending_deletion");
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "account_frozen" });
  });
  it("non-editor (plain member, not creator) ⇒ forbidden, no write", async () => {
    expect(await setNodeConnectorBinding(setArgs({ callerUserId: "member-x", callerRole: "member" }))).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(mockSetForNode).not.toHaveBeenCalled();
  });
});

describe("setNodeConnectorBinding — connector validation (fail closed)", () => {
  it("connector not a member ⇒ connector_not_member", async () => {
    mockIsMember.mockResolvedValue(false);
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "connector_not_member" });
    expect(mockSetForNode).not.toHaveBeenCalled();
  });
  it("connector disconnected / no active row ⇒ connector_not_connected", async () => {
    mockGetActive.mockResolvedValue(null);
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "connector_not_connected" });
    expect(mockSetForNode).not.toHaveBeenCalled();
  });
  it("connector connected but UNSHARED ⇒ connector_not_shared (no silent share)", async () => {
    mockListShared.mockResolvedValue(new Set()); // not in shared set
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: false, reason: "connector_not_shared" });
    expect(mockSetForNode).not.toHaveBeenCalled();
  });
  it("owner/admin binding to an UNSHARED connector is STILL connector_not_shared", async () => {
    mockListShared.mockResolvedValue(new Set());
    expect(await setNodeConnectorBinding(setArgs({ callerUserId: "owner-1", callerRole: "owner" }))).toEqual({
      ok: false, reason: "connector_not_shared",
    });
  });
});

describe("setNodeConnectorBinding — success", () => {
  it("creator binds a member + connected + shared connector ⇒ ok, upserts", async () => {
    expect(await setNodeConnectorBinding(setArgs())).toEqual({ ok: true });
    expect(mockSetForNode).toHaveBeenCalledWith({
      workflowId: "wf-1", nodeId: "node-7", provider: "gmail", connectorUserId: CONNECTOR, createdByUserId: CREATOR,
    });
  });
  it("owner (non-creator) may bind a shared connector ⇒ ok", async () => {
    expect(await setNodeConnectorBinding(setArgs({ callerUserId: "owner-1", callerRole: "owner" }))).toEqual({ ok: true });
  });
  it("connector binding their OWN shared connection ⇒ ok (connector is the creator here)", async () => {
    expect(await setNodeConnectorBinding(setArgs({ connectorUserId: CREATOR, callerUserId: CREATOR }))).toEqual({ ok: false, reason: "connector_not_shared" });
    // (creator not in shared set in this fixture) — flip the set to prove the happy path:
    mockListShared.mockResolvedValue(new Set([CREATOR]));
    expect(await setNodeConnectorBinding(setArgs({ connectorUserId: CREATOR, callerUserId: CREATOR }))).toEqual({ ok: true });
  });
});

describe("clearNodeConnectorBinding", () => {
  it("flag OFF ⇒ not_enabled", async () => {
    mockFlag.mockReturnValue(false);
    expect(await clearNodeConnectorBinding({ workflowId: "wf-1", nodeId: "node-7", callerUserId: CREATOR, callerRole: "member" })).toEqual({
      ok: false, reason: "not_enabled",
    });
  });
  it("non-editor ⇒ forbidden", async () => {
    expect(await clearNodeConnectorBinding({ workflowId: "wf-1", nodeId: "node-7", callerUserId: "m", callerRole: "member" })).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(mockDeleteForNode).not.toHaveBeenCalled();
  });
  it("editor clears ⇒ ok with cleared flag", async () => {
    expect(await clearNodeConnectorBinding({ workflowId: "wf-1", nodeId: "node-7", callerUserId: CREATOR, callerRole: "member" })).toEqual({
      ok: true, cleared: true,
    });
  });
});

describe("listEligibleSharedConnectors — safe picker", () => {
  it("returns {userId, displayName, role} for members in the shared set; NO email leak", async () => {
    mockListShared.mockResolvedValue(new Set(["alice", "bob"]));
    mockListMembers.mockResolvedValue([
      { userId: "alice", displayName: "Alice", role: "owner", email: "alice@example.com" },
      { userId: "bob", displayName: "Bob", role: "member", email: "bob@example.com" },
      { userId: "carol", displayName: "Carol", role: "member", email: "carol@example.com" }, // not shared
    ]);
    const res = await listEligibleSharedConnectors({ workflowId: "wf-1", nodeId: "node-7", callerUserId: CREATOR, callerRole: "member" });
    expect(res).toEqual({
      ok: true,
      connectors: [
        { userId: "alice", displayName: "Alice", role: "owner" },
        { userId: "bob", displayName: "Bob", role: "member" },
      ],
    });
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("@example.com");
    expect(serialized).not.toContain("carol");
  });
  it("non-editor ⇒ forbidden", async () => {
    expect(await listEligibleSharedConnectors({ workflowId: "wf-1", nodeId: "node-7", callerUserId: "m", callerRole: "member" })).toEqual({
      ok: false, reason: "forbidden",
    });
  });
  it("flag OFF ⇒ not_enabled", async () => {
    mockFlag.mockReturnValue(false);
    expect((await listEligibleSharedConnectors({ workflowId: "wf-1", nodeId: "node-7", callerUserId: CREATOR, callerRole: "member" })).ok).toBe(false);
  });
});

describe("listWorkflowConnectorBindings", () => {
  it("editor sees per-node bindings with display name (no email)", async () => {
    mockListByWorkflow.mockResolvedValue([{ nodeId: "node-7", provider: "gmail", connectorUserId: "alice" }]);
    mockListMembers.mockResolvedValue([{ userId: "alice", displayName: "Alice", role: "owner", email: "alice@example.com" }]);
    const res = await listWorkflowConnectorBindings({ workflowId: "wf-1", callerUserId: CREATOR, callerRole: "member" });
    expect(res).toEqual({
      ok: true,
      bindings: [{ nodeId: "node-7", provider: "gmail", connectorUserId: "alice", connectorDisplayName: "Alice" }],
    });
    expect(JSON.stringify(res)).not.toContain("@example.com");
  });
  it("non-editor ⇒ forbidden", async () => {
    expect(await listWorkflowConnectorBindings({ workflowId: "wf-1", callerUserId: "m", callerRole: "member" })).toEqual({
      ok: false, reason: "forbidden",
    });
  });
});
