/**
 * @jest-environment node
 *
 * CS-2 — per-node credential-owner resolution helpers (pure logic).
 *
 * Proves the batch-load flag gating (no DB call when OFF, single call when ON)
 * and the effective-owner decision matrix: personal node with an accepted owner
 * runs under that owner; otherwise the creator; account/service providers +
 * missing provider/nodeId always resolve to the creator.
 */

const mockFlag = jest.fn();
const mockListAccepted = jest.fn();
const mockGetForNode = jest.fn();

jest.mock("@/services/teamCredentials/flags", () => ({
  isNodeCredentialReassignmentEnabled: () => mockFlag(),
}));
jest.mock("@/repositories/workflowNodeCredentials", () => ({
  listAcceptedByWorkflowServiceRole: (...a: unknown[]) => mockListAccepted(...a),
  getForNodeServiceRole: (...a: unknown[]) => mockGetForNode(...a),
}));

import {
  loadAcceptedNodeOwners,
  effectiveCredentialOwner,
  resolveEffectiveNodeOwner,
  type AcceptedNodeOwners,
} from "@/services/teamCredentials/nodeCredentialOwners";

function acceptedRow(nodeId: string, ownerUserId: string) {
  return {
    id: `grant-${nodeId}`,
    workflowId: "wf-1",
    nodeId,
    provider: "gmail",
    credentialOwnerUserId: ownerUserId,
    status: "accepted" as const,
    requestedByUserId: "owner-1",
    requestedAt: "2026-06-06T00:00:00Z",
    decidedAt: "2026-06-06T01:00:00Z",
    createdAt: "2026-06-06T00:00:00Z",
    updatedAt: "2026-06-06T01:00:00Z",
  };
}

beforeEach(() => {
  mockFlag.mockReset();
  mockListAccepted.mockReset();
  mockGetForNode.mockReset();
});

describe("loadAcceptedNodeOwners — flag gating + batch-once", () => {
  it("flag OFF → empty map and NO repo/DB call", async () => {
    mockFlag.mockReturnValue(false);
    const map = await loadAcceptedNodeOwners("wf-1");
    expect(map.size).toBe(0);
    expect(mockListAccepted).not.toHaveBeenCalled();
  });

  it("flag ON → builds nodeId→owner map from a SINGLE repo call", async () => {
    mockFlag.mockReturnValue(true);
    mockListAccepted.mockResolvedValue([
      acceptedRow("node-1", "userB"),
      acceptedRow("node-2", "userC"),
    ]);
    const map = await loadAcceptedNodeOwners("wf-1");
    expect(mockListAccepted).toHaveBeenCalledTimes(1);
    expect(mockListAccepted).toHaveBeenCalledWith("wf-1");
    expect(map.get("node-1")).toBe("userB");
    expect(map.get("node-2")).toBe("userC");
  });

  it("flag ON + no accepted rows → empty map", async () => {
    mockFlag.mockReturnValue(true);
    mockListAccepted.mockResolvedValue([]);
    const map = await loadAcceptedNodeOwners("wf-1");
    expect(map.size).toBe(0);
  });
});

describe("effectiveCredentialOwner — decision matrix (pure)", () => {
  const owners: AcceptedNodeOwners = new Map([["node-1", "userB"]]);

  it("personal provider + accepted owner → the assigned owner (not the creator)", () => {
    expect(
      effectiveCredentialOwner({
        provider: "gmail",
        nodeId: "node-1",
        creatorUserId: "creatorA",
        acceptedOwners: owners,
      }),
    ).toBe("userB");
  });

  it("personal provider + NO accepted owner → the creator", () => {
    expect(
      effectiveCredentialOwner({
        provider: "gmail",
        nodeId: "node-2",
        creatorUserId: "creatorA",
        acceptedOwners: owners,
      }),
    ).toBe("creatorA");
  });

  it("account/service provider → the creator even if an owner row exists for the node", () => {
    // A slack node at node-1 — the owner map entry is ignored (account-shared).
    expect(
      effectiveCredentialOwner({
        provider: "slack",
        nodeId: "node-1",
        creatorUserId: "creatorA",
        acceptedOwners: owners,
      }),
    ).toBe("creatorA");
  });

  it("empty owner map (flag OFF / no rows) → always the creator", () => {
    const empty: AcceptedNodeOwners = new Map();
    expect(
      effectiveCredentialOwner({
        provider: "gmail",
        nodeId: "node-1",
        creatorUserId: "creatorA",
        acceptedOwners: empty,
      }),
    ).toBe("creatorA");
  });

  it("missing / blank provider or nodeId → the creator (never crash)", () => {
    expect(
      effectiveCredentialOwner({ provider: null, nodeId: "node-1", creatorUserId: "creatorA", acceptedOwners: owners }),
    ).toBe("creatorA");
    expect(
      effectiveCredentialOwner({ provider: "gmail", nodeId: undefined, creatorUserId: "creatorA", acceptedOwners: owners }),
    ).toBe("creatorA");
    expect(
      effectiveCredentialOwner({ provider: "", nodeId: "", creatorUserId: "creatorA", acceptedOwners: owners }),
    ).toBe("creatorA");
  });
});

describe("resolveEffectiveNodeOwner — single-node (options path)", () => {
  it("flag OFF → null and NO repo/DB call", async () => {
    mockFlag.mockReturnValue(false);
    expect(await resolveEffectiveNodeOwner("wf-1", "node-1")).toBeNull();
    expect(mockGetForNode).not.toHaveBeenCalled();
  });

  it("flag ON, no nodeId → null and NO repo call", async () => {
    mockFlag.mockReturnValue(true);
    expect(await resolveEffectiveNodeOwner("wf-1", null)).toBeNull();
    expect(mockGetForNode).not.toHaveBeenCalled();
  });

  it("flag ON + ACCEPTED grant → the assigned owner id", async () => {
    mockFlag.mockReturnValue(true);
    mockGetForNode.mockResolvedValue(acceptedRow("node-1", "userB"));
    expect(await resolveEffectiveNodeOwner("wf-1", "node-1")).toBe("userB");
    expect(mockGetForNode).toHaveBeenCalledWith("wf-1", "node-1");
  });

  it("flag ON + PENDING grant → null (a pending request is not yet effective)", async () => {
    mockFlag.mockReturnValue(true);
    mockGetForNode.mockResolvedValue({ ...acceptedRow("node-1", "userB"), status: "pending" });
    expect(await resolveEffectiveNodeOwner("wf-1", "node-1")).toBeNull();
  });

  it("flag ON + no grant → null", async () => {
    mockFlag.mockReturnValue(true);
    mockGetForNode.mockResolvedValue(null);
    expect(await resolveEffectiveNodeOwner("wf-1", "node-1")).toBeNull();
  });
});
