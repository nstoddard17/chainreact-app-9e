/**
 * @jest-environment node
 *
 * Tests for the CS-5b builder state read
 * (services/integrations/connectionBinding.getNodeConnectorBindingState). The
 * status precedence mirrors the CS-4b resolver: grant → bound(valid) → stale →
 * single-sharer → ambiguous. No-leak: status + safe {userId,displayName,role} +
 * a display name only.
 */
const mockGetWf = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockListShared = jest.fn();
const mockAccepted = jest.fn();
const mockGetBinding = jest.fn();
const mockListMembers = jest.fn();
const mockFlag = jest.fn();

jest.mock("@/repositories/workflows", () => ({ getByIdServiceRole: (...a: unknown[]) => mockGetWf(...a) }));
jest.mock("@/repositories/accounts", () => ({ getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a) }));
jest.mock("@/repositories/accountMemberships", () => ({ isMemberServiceRole: jest.fn() }));
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: jest.fn(),
  listSharedConnectorUserIdsServiceRole: (...a: unknown[]) => mockListShared(...a),
}));
jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  loadAcceptedNodeOwners: (...a: unknown[]) => mockAccepted(...a),
}));
jest.mock("@/repositories/workflowNodeConnectorBindings", () => ({
  setForNodeServiceRole: jest.fn(),
  deleteForNodeServiceRole: jest.fn(),
  listByWorkflowServiceRole: jest.fn(),
  getForNodeServiceRole: (...a: unknown[]) => mockGetBinding(...a),
}));
jest.mock("@/services/accounts/membership", () => ({ listMembers: (...a: unknown[]) => mockListMembers(...a) }));
jest.mock("@/services/integrations/connectionSharingFlags", () => ({ isConnectionSharingEnabled: () => mockFlag() }));

import { getNodeConnectorBindingState } from "@/services/integrations/connectionBinding";

const CREATOR = "creator-1";
function wf(over: Record<string, unknown> = {}) {
  return {
    id: "wf-1", accountId: "acc-1", createdByUserId: CREATOR, state: "active",
    draftDefinition: { nodes: [{ id: "node-7", provider: "gmail" }], edges: [] }, ...over,
  };
}
const args = (over = {}) => ({ workflowId: "wf-1", nodeId: "node-7", callerUserId: CREATOR, callerRole: "owner" as const, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
  mockGetWf.mockResolvedValue(wf());
  mockGetDeletionStatus.mockResolvedValue("active");
  mockAccepted.mockResolvedValue(new Map());
  mockGetBinding.mockResolvedValue(null);
  mockListShared.mockResolvedValue(new Set());
  mockListMembers.mockResolvedValue([
    { userId: "alice", displayName: "Alice", role: "owner", email: "alice@example.com" },
    { userId: "bob", displayName: "Bob", role: "member", email: "bob@example.com" },
  ]);
});

describe("getNodeConnectorBindingState", () => {
  it("flag OFF → not_enabled", async () => {
    mockFlag.mockReturnValue(false);
    expect(await getNodeConnectorBindingState(args())).toEqual({ ok: false, reason: "not_enabled" });
  });

  it("account/native node → 200 not_applicable state (not an error)", async () => {
    mockGetWf.mockResolvedValue(wf({ draftDefinition: { nodes: [{ id: "node-7", provider: "slack" }], edges: [] } }));
    const r = await getNodeConnectorBindingState(args());
    expect(r).toEqual({ ok: true, status: "not_applicable", connectors: [], currentConnectorDisplayName: null });
  });

  it("accepted node-credential grant WINS → not_applicable (reassignment UI owns it)", async () => {
    mockAccepted.mockResolvedValue(new Map([["node-7", "grantOwner"]]));
    mockListShared.mockResolvedValue(new Set(["alice", "bob"]));
    const r = await getNodeConnectorBindingState(args());
    expect(r.ok && r.status).toBe("not_applicable");
  });

  it("0 shared → unavailable", async () => {
    const r = await getNodeConnectorBindingState(args());
    expect(r.ok && r.status).toBe("unavailable");
  });

  it("exactly one shared connector → single_sharer + that display name", async () => {
    mockListShared.mockResolvedValue(new Set(["alice"]));
    const r = await getNodeConnectorBindingState(args());
    expect(r.ok && r.status).toBe("single_sharer");
    expect(r.ok && r.currentConnectorDisplayName).toBe("Alice");
  });

  it("2+ shared, no binding → needs_selection with safe connector options", async () => {
    mockListShared.mockResolvedValue(new Set(["alice", "bob"]));
    const r = await getNodeConnectorBindingState(args());
    expect(r.ok && r.status).toBe("needs_selection");
    expect(r.ok && r.connectors).toEqual([
      { userId: "alice", displayName: "Alice", role: "owner" },
      { userId: "bob", displayName: "Bob", role: "member" },
    ]);
  });

  it("2+ shared + VALID binding → bound with the bound connector's display name", async () => {
    mockListShared.mockResolvedValue(new Set(["alice", "bob"]));
    mockGetBinding.mockResolvedValue({ nodeId: "node-7", provider: "gmail", connectorUserId: "bob" });
    const r = await getNodeConnectorBindingState(args());
    expect(r.ok && r.status).toBe("bound");
    expect(r.ok && r.currentConnectorDisplayName).toBe("Bob");
  });

  it("STALE binding (bound connector no longer shared) → unavailable, never silently another", async () => {
    mockListShared.mockResolvedValue(new Set(["alice", "bob"])); // 'carol' not shared
    mockGetBinding.mockResolvedValue({ nodeId: "node-7", provider: "gmail", connectorUserId: "carol" });
    const r = await getNodeConnectorBindingState(args());
    expect(r.ok && r.status).toBe("unavailable");
    expect(r.ok && r.currentConnectorDisplayName).toBe(null);
  });

  it("non-editor (plain member) → forbidden", async () => {
    const r = await getNodeConnectorBindingState(args({ callerUserId: "m", callerRole: "member" }));
    expect(r).toEqual({ ok: false, reason: "forbidden" });
  });

  it("NO LEAK: no email / raw scope / provider account id in the state", async () => {
    mockListShared.mockResolvedValue(new Set(["alice", "bob"]));
    const r = await getNodeConnectorBindingState(args());
    expect(JSON.stringify(r)).not.toContain("@example.com");
  });
});
