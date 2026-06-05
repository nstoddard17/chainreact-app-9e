/**
 * @jest-environment node
 *
 * CS-3 — per-node credential reassignment service (consent lifecycle).
 *
 * Mocks all repos + the flag so no DB is touched. Proves the authorization +
 * verification rules for request / accept / decline / revoke, the feature-flag
 * gate, and that an accepted row only ever results from a target-only accept.
 */

const mockFlag = jest.fn();
jest.mock("@/services/teamCredentials/flags", () => ({
  isNodeCredentialReassignmentEnabled: () => mockFlag(),
}));

const mockGetByIdSR = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdSR(...a),
}));

const mockGetDeletionStatus = jest.fn();
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
}));

const mockIsMemberSR = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMemberSR(...a),
}));

const mockGetActive = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
}));

const mockGetForNode = jest.fn();
const mockCreatePending = jest.fn();
const mockMarkAccepted = jest.fn();
const mockMarkDeclined = jest.fn();
const mockMarkRevoked = jest.fn();
jest.mock("@/repositories/workflowNodeCredentials", () => ({
  getForNodeServiceRole: (...a: unknown[]) => mockGetForNode(...a),
  createPendingRequestServiceRole: (...a: unknown[]) => mockCreatePending(...a),
  markAcceptedServiceRole: (...a: unknown[]) => mockMarkAccepted(...a),
  markDeclinedServiceRole: (...a: unknown[]) => mockMarkDeclined(...a),
  markRevokedServiceRole: (...a: unknown[]) => mockMarkRevoked(...a),
  DUPLICATE_LIVE_NODE_CREDENTIAL: "DUPLICATE_LIVE_NODE_CREDENTIAL",
}));

import {
  requestReassignment,
  acceptReassignment,
  declineReassignment,
  revokeReassignment,
} from "@/services/teamCredentials/reassignmentService";

const gmailNode = { id: "node-gmail", kind: "action", provider: "gmail", type: "send", config: {}, position: { x: 0, y: 0 } };
const slackNode = { id: "node-slack", kind: "action", provider: "slack", type: "post", config: {}, position: { x: 0, y: 0 } };

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    accountId: "team-1",
    createdByUserId: "creatorA",
    name: "WF",
    state: "active",
    draftDefinition: { nodes: [gmailNode, slackNode], edges: [] },
    ...overrides,
  };
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: "grant-1",
    workflowId: "wf-1",
    nodeId: "node-gmail",
    provider: "gmail",
    credentialOwnerUserId: "userB",
    status: "pending",
    requestedByUserId: "creatorA",
    requestedAt: "2026-06-06T00:00:00Z",
    decidedAt: null,
    createdAt: "2026-06-06T00:00:00Z",
    updatedAt: "2026-06-06T00:00:00Z",
    ...overrides,
  };
}

/** getActiveForExecution returns a row only for users in `connected`. */
function connectedUsers(...connected: string[]) {
  mockGetActive.mockImplementation(
    (_a: string, _p: string, _pa: string | null, opts?: { connectedByUserId?: string }) =>
      Promise.resolve(connected.includes(opts?.connectedByUserId ?? "") ? { id: "int-1" } : null),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  mockGetByIdSR.mockResolvedValue(workflow());
  mockGetDeletionStatus.mockResolvedValue("active");
  mockIsMemberSR.mockResolvedValue(true);
  mockGetForNode.mockResolvedValue(null);
  connectedUsers("userB");
});

describe("requestReassignment", () => {
  it("owner can request a personal-provider node → pending grant created", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: true, status: "pending" });
    expect(mockCreatePending).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf-1", nodeId: "node-gmail", provider: "gmail",
        credentialOwnerUserId: "userB", requestedByUserId: "ownerX",
      }),
    );
  });

  it("admin can request", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "adminX", actingRole: "admin",
    });
    expect(r.ok).toBe(true);
  });

  it("the workflow creator (member role) can request", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "creatorA", actingRole: "member",
    });
    expect(r.ok).toBe(true);
  });

  it("a plain member who is NOT the creator cannot request → forbidden", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "randoM", actingRole: "member",
    });
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(mockCreatePending).not.toHaveBeenCalled();
  });

  it("account/service provider node → not_applicable", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-slack", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "not_applicable" });
    expect(mockCreatePending).not.toHaveBeenCalled();
  });

  it("target must be an account member", async () => {
    mockIsMemberSR.mockResolvedValue(false);
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "ghost",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "target_not_member" });
  });

  it("target must already have an active connection", async () => {
    connectedUsers(); // nobody connected
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "target_not_connected" });
    expect(mockCreatePending).not.toHaveBeenCalled();
  });

  it("an existing live grant → duplicate", async () => {
    mockGetForNode.mockResolvedValue(grant({ status: "accepted" }));
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "duplicate" });
  });

  it("assigning the creator back → no_op", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "creatorA",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "no_op" });
  });

  it("feature flag OFF → feature_disabled (no repo work)", async () => {
    mockFlag.mockReturnValue(false);
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "feature_disabled" });
    expect(mockGetByIdSR).not.toHaveBeenCalled();
  });

  it("unknown node → node_not_found", async () => {
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "ghost-node", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "node_not_found" });
  });

  it("frozen account → account_frozen", async () => {
    mockGetDeletionStatus.mockResolvedValue("pending_deletion");
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "account_frozen" });
  });

  it("maps a partial-unique race to duplicate", async () => {
    mockCreatePending.mockRejectedValue(new Error("DUPLICATE_LIVE_NODE_CREDENTIAL"));
    const r = await requestReassignment({
      workflowId: "wf-1", nodeId: "node-gmail", targetUserId: "userB",
      callerUserId: "ownerX", actingRole: "owner",
    });
    expect(r).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("acceptReassignment", () => {
  it("the target member accepts a pending request → accepted", async () => {
    mockGetForNode.mockResolvedValue(grant({ credentialOwnerUserId: "userB" }));
    const r = await acceptReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "userB" });
    expect(r).toEqual({ ok: true, status: "accepted" });
    expect(mockMarkAccepted).toHaveBeenCalledWith("grant-1", expect.any(String));
  });

  it("a non-target cannot accept → not_target", async () => {
    mockGetForNode.mockResolvedValue(grant({ credentialOwnerUserId: "userB" }));
    const r = await acceptReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "someoneElse" });
    expect(r).toEqual({ ok: false, reason: "not_target" });
    expect(mockMarkAccepted).not.toHaveBeenCalled();
  });

  it("re-check: target lost their connection → target_not_connected", async () => {
    mockGetForNode.mockResolvedValue(grant({ credentialOwnerUserId: "userB" }));
    connectedUsers(); // userB no longer connected
    const r = await acceptReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "userB" });
    expect(r).toEqual({ ok: false, reason: "target_not_connected" });
    expect(mockMarkAccepted).not.toHaveBeenCalled();
  });

  it("no pending grant → grant_not_found", async () => {
    mockGetForNode.mockResolvedValue(null);
    const r = await acceptReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "userB" });
    expect(r).toEqual({ ok: false, reason: "grant_not_found" });
  });

  it("flag OFF → feature_disabled", async () => {
    mockFlag.mockReturnValue(false);
    const r = await acceptReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "userB" });
    expect(r).toEqual({ ok: false, reason: "feature_disabled" });
  });
});

describe("declineReassignment", () => {
  it("the target declines a pending request → declined", async () => {
    mockGetForNode.mockResolvedValue(grant({ credentialOwnerUserId: "userB" }));
    const r = await declineReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "userB" });
    expect(r).toEqual({ ok: true, status: "declined" });
    expect(mockMarkDeclined).toHaveBeenCalledWith("grant-1", expect.any(String));
  });

  it("a non-target cannot decline → not_target", async () => {
    mockGetForNode.mockResolvedValue(grant({ credentialOwnerUserId: "userB" }));
    const r = await declineReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "rando" });
    expect(r).toEqual({ ok: false, reason: "not_target" });
  });
});

describe("revokeReassignment", () => {
  it("owner/admin can revoke", async () => {
    mockGetForNode.mockResolvedValue(grant({ status: "accepted", credentialOwnerUserId: "userB" }));
    const r = await revokeReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "adminX", actingRole: "admin" });
    expect(r).toEqual({ ok: true, status: "revoked" });
    expect(mockMarkRevoked).toHaveBeenCalledWith("grant-1", expect.any(String));
  });

  it("the assigned owner can revoke their own grant", async () => {
    mockGetForNode.mockResolvedValue(grant({ status: "accepted", credentialOwnerUserId: "userB" }));
    const r = await revokeReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "userB", actingRole: "member" });
    expect(r.ok).toBe(true);
  });

  it("the workflow creator can revoke", async () => {
    mockGetForNode.mockResolvedValue(grant({ status: "accepted", credentialOwnerUserId: "userB" }));
    const r = await revokeReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "creatorA", actingRole: "member" });
    expect(r.ok).toBe(true);
  });

  it("an unrelated plain member cannot revoke → forbidden", async () => {
    mockGetForNode.mockResolvedValue(grant({ status: "accepted", credentialOwnerUserId: "userB" }));
    const r = await revokeReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "rando", actingRole: "member" });
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(mockMarkRevoked).not.toHaveBeenCalled();
  });

  it("no live grant → grant_not_found", async () => {
    mockGetForNode.mockResolvedValue(null);
    const r = await revokeReassignment({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "ownerX", actingRole: "owner" });
    expect(r).toEqual({ ok: false, reason: "grant_not_found" });
  });
});
