/**
 * @jest-environment node
 *
 * CS-4b — credential-owner metadata + eligible-targets service. Mocks all repos +
 * listMembers + the flag (real provider classifier). Proves the safe display-only
 * shape, the flag gating, canManage, the connection filter, and the no-leak rule
 * (display name only — no email).
 */

const mockFlag = jest.fn();
jest.mock("@/services/teamCredentials/flags", () => ({
  isNodeCredentialReassignmentEnabled: () => mockFlag(),
}));

const mockGetByIdSR = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetByIdSR(...a),
}));

const mockListGrants = jest.fn();
jest.mock("@/repositories/workflowNodeCredentials", () => ({
  listByWorkflowServiceRole: (...a: unknown[]) => mockListGrants(...a),
}));

const mockListConnected = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  listActiveConnectedUserIdsServiceRole: (...a: unknown[]) => mockListConnected(...a),
}));

const mockListMembers = jest.fn();
jest.mock("@/services/accounts/membership", () => ({
  listMembers: (...a: unknown[]) => mockListMembers(...a),
}));

import {
  buildNodeCredentialOwnerMetadata,
  listEligibleReassignmentTargets,
} from "@/services/teamCredentials/credentialOwnerMetadata";

const gmailNode = { id: "node-gmail", kind: "action", provider: "gmail", type: "send", config: {}, position: { x: 0, y: 0 } };
const slackNode = { id: "node-slack", kind: "action", provider: "slack", type: "post", config: {}, position: { x: 0, y: 0 } };

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    accountId: "team-1",
    createdByUserId: "creatorA",
    state: "active",
    draftDefinition: { nodes: [gmailNode, slackNode], edges: [] },
    ...overrides,
  };
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: "g-1",
    workflowId: "wf-1",
    nodeId: "node-gmail",
    provider: "gmail",
    credentialOwnerUserId: "userB",
    status: "accepted",
    requestedByUserId: "creatorA",
    requestedAt: "t",
    decidedAt: "t",
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  };
}

const members = [
  { accountId: "team-1", userId: "creatorA", role: "owner", email: "creator@x.io", displayName: "Casey Owner" },
  { accountId: "team-1", userId: "userB", role: "member", email: "dana@x.io", displayName: "Dana Reyes" },
  { accountId: "team-1", userId: "userC", role: "member", email: "evan@x.io", displayName: "Evan Lee" },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  mockGetByIdSR.mockResolvedValue(workflow());
  mockListGrants.mockResolvedValue([]);
  mockListMembers.mockResolvedValue(members);
  mockListConnected.mockResolvedValue(new Set(["userB", "userC"]));
});

describe("buildNodeCredentialOwnerMetadata", () => {
  it("returns not-found for a missing/deleted workflow", async () => {
    mockGetByIdSR.mockResolvedValue(null);
    expect(await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "creatorA", callerRole: "owner" }))
      .toEqual({ ok: false, reason: "workflow_not_found" });
  });

  it("flag OFF → safe empty state (canManage false, no nodes, no grant lookup)", async () => {
    mockFlag.mockReturnValue(false);
    const r = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "creatorA", callerRole: "owner" });
    expect(r).toEqual({ ok: true, metadata: { workflowId: "wf-1", canManage: false, nodes: [] } });
    expect(mockListGrants).not.toHaveBeenCalled();
  });

  it("accepted grant → node record with the assigned owner's DISPLAY NAME (no email)", async () => {
    mockListGrants.mockResolvedValue([grant({ status: "accepted", credentialOwnerUserId: "userB" })]);
    const r = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "creatorA", callerRole: "owner" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.metadata.nodes).toEqual([
        { nodeId: "node-gmail", provider: "gmail", status: "accepted", ownerDisplayName: "Dana Reyes" },
      ]);
      // No email anywhere in the serialized metadata.
      expect(JSON.stringify(r.metadata)).not.toMatch(/@/);
    }
  });

  it("pending grant → node record with the requested target's display name", async () => {
    mockListGrants.mockResolvedValue([grant({ status: "pending", credentialOwnerUserId: "userC" })]);
    const r = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "creatorA", callerRole: "owner" });
    if (r.ok) {
      expect(r.metadata.nodes[0]).toMatchObject({ status: "pending", ownerDisplayName: "Evan Lee" });
    }
  });

  it("filters out declined/revoked history (live grants only)", async () => {
    mockListGrants.mockResolvedValue([
      grant({ nodeId: "node-gmail", status: "revoked" }),
      grant({ id: "g-2", nodeId: "node-gmail", status: "declined" }),
    ]);
    const r = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "creatorA", callerRole: "owner" });
    if (r.ok) expect(r.metadata.nodes).toEqual([]);
  });

  it("canManage true for owner/admin and the creator; false for a plain non-creator member", async () => {
    const owner = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "x", callerRole: "owner" });
    const admin = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "x", callerRole: "admin" });
    const creator = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "creatorA", callerRole: "member" });
    const member = await buildNodeCredentialOwnerMetadata({ workflowId: "wf-1", callerUserId: "rando", callerRole: "member" });
    expect(owner.ok && owner.metadata.canManage).toBe(true);
    expect(admin.ok && admin.metadata.canManage).toBe(true);
    expect(creator.ok && creator.metadata.canManage).toBe(true);
    expect(member.ok && member.metadata.canManage).toBe(false);
  });
});

describe("listEligibleReassignmentTargets", () => {
  it("flag OFF → feature_disabled", async () => {
    mockFlag.mockReturnValue(false);
    expect(await listEligibleReassignmentTargets({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "creatorA", callerRole: "owner" }))
      .toEqual({ ok: false, reason: "feature_disabled" });
  });

  it("a plain non-creator member → forbidden (connection status is manager-only)", async () => {
    expect(await listEligibleReassignmentTargets({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "rando", callerRole: "member" }))
      .toEqual({ ok: false, reason: "forbidden" });
  });

  it("account/service provider node → not_applicable", async () => {
    expect(await listEligibleReassignmentTargets({ workflowId: "wf-1", nodeId: "node-slack", callerUserId: "creatorA", callerRole: "owner" }))
      .toEqual({ ok: false, reason: "not_applicable" });
  });

  it("unknown node → node_not_found", async () => {
    expect(await listEligibleReassignmentTargets({ workflowId: "wf-1", nodeId: "ghost", callerUserId: "creatorA", callerRole: "owner" }))
      .toEqual({ ok: false, reason: "node_not_found" });
  });

  it("returns connected members (display name + role + id only), excluding the current owner (creator)", async () => {
    // connected = {userB, userC}; creatorA is the current owner (no accepted grant) → excluded anyway.
    const r = await listEligibleReassignmentTargets({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "creatorA", callerRole: "owner" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.members).toEqual([
        { userId: "userB", displayName: "Dana Reyes", role: "member" },
        { userId: "userC", displayName: "Evan Lee", role: "member" },
      ]);
      // No email / label / token anywhere.
      expect(JSON.stringify(r.members)).not.toMatch(/@/);
    }
  });

  it("excludes the accepted owner from the list (assigning them is a no-op)", async () => {
    mockListGrants.mockResolvedValue([grant({ status: "accepted", credentialOwnerUserId: "userB" })]);
    const r = await listEligibleReassignmentTargets({ workflowId: "wf-1", nodeId: "node-gmail", callerUserId: "creatorA", callerRole: "owner" });
    if (r.ok) {
      expect(r.members.map((m) => m.userId)).toEqual(["userC"]); // userB is the current owner
    }
  });
});
