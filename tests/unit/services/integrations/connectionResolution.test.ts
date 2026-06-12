/**
 * @jest-environment node
 *
 * Tests for the CS-4b shared credential plan
 * (services/integrations/connectionResolution.buildWorkflowCredentialPlan) — the
 * single computation the run/edit gate and the execution engine both consume.
 * The pure precedence + classifier run for real; the three reads (accepted
 * grants, bindings, shared sets) are mocked. This is the canonical EXECUTION-OWNER
 * proof: `ownerByNode` is exactly what the engine threads into the credential
 * context, and `allTeamRunnable` is exactly what the gate decides on.
 */
const mockAccepted = jest.fn();
const mockBindings = jest.fn();
const mockShared = jest.fn();

jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  loadAcceptedNodeOwners: (...a: unknown[]) => mockAccepted(...a),
}));
jest.mock("@/repositories/workflowNodeConnectorBindings", () => ({
  listByWorkflowServiceRole: (...a: unknown[]) => mockBindings(...a),
}));
jest.mock("@/repositories/integrations", () => ({
  listSharedConnectorUserIdsServiceRole: (...a: unknown[]) => mockShared(...a),
}));

import { buildWorkflowCredentialPlan } from "@/services/integrations/connectionResolution";

const CREATOR = "creator-1";
const gmailNode = { id: "n-gmail", provider: "gmail" };

function plan(over: { nodes?: { id: string; provider: string }[] } = {}) {
  return buildWorkflowCredentialPlan({
    workflowId: "wf-1",
    accountId: "acc-1",
    createdByUserId: CREATOR,
    nodes: over.nodes ?? [{ id: "t", provider: "native" }, gmailNode],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccepted.mockResolvedValue(new Map()); // no grants
  mockBindings.mockResolvedValue([]); // no bindings
  mockShared.mockResolvedValue(new Set()); // no sharers
});

describe("buildWorkflowCredentialPlan", () => {
  it("no personal nodes (native/account only) → empty plan, allTeamRunnable, NO reads", async () => {
    const p = await plan({ nodes: [{ id: "t", provider: "native" }, { id: "a", provider: "slack" }] });
    expect(p.ownerByNode.size).toBe(0);
    expect(p.allTeamRunnable).toBe(true);
    expect(mockBindings).not.toHaveBeenCalled();
    expect(mockShared).not.toHaveBeenCalled();
  });

  it("single shared connector → owner = that connector (execution), teamRunnable", async () => {
    mockShared.mockResolvedValue(new Set(["alice"]));
    const p = await plan();
    expect(p.ownerByNode.get("n-gmail")).toBe("alice");
    expect(p.resolutions.get("n-gmail")!.via).toBe("single_sharer");
    expect(p.allTeamRunnable).toBe(true);
  });

  it("two shared, NO binding → owner = creator (fail closed); NOT team-runnable; NOT earliest row", async () => {
    mockShared.mockResolvedValue(new Set(["alice", "bob"]));
    const p = await plan();
    expect(p.ownerByNode.get("n-gmail")).toBe(CREATOR); // creator pin, never 'alice'/'bob'
    expect(p.allTeamRunnable).toBe(false);
  });

  it("two shared + VALID binding → owner = bound connector; team-runnable", async () => {
    mockShared.mockResolvedValue(new Set(["alice", "bob"]));
    mockBindings.mockResolvedValue([{ nodeId: "n-gmail", provider: "gmail", connectorUserId: "bob" }]);
    const p = await plan();
    expect(p.ownerByNode.get("n-gmail")).toBe("bob");
    expect(p.resolutions.get("n-gmail")!.via).toBe("binding");
    expect(p.allTeamRunnable).toBe(true);
  });

  it("accepted grant BEATS binding + share", async () => {
    mockShared.mockResolvedValue(new Set(["alice", "bob"]));
    mockBindings.mockResolvedValue([{ nodeId: "n-gmail", provider: "gmail", connectorUserId: "bob" }]);
    mockAccepted.mockResolvedValue(new Map([["n-gmail", "grantOwner"]]));
    const p = await plan();
    expect(p.ownerByNode.get("n-gmail")).toBe("grantOwner");
    expect(p.resolutions.get("n-gmail")!.via).toBe("grant");
  });

  it("INVALID binding (bound connector no longer shared) → ignored, falls to creator (fail closed)", async () => {
    mockShared.mockResolvedValue(new Set(["alice", "bob"])); // 'carol' not shared anymore
    mockBindings.mockResolvedValue([{ nodeId: "n-gmail", provider: "gmail", connectorUserId: "carol" }]);
    const p = await plan();
    expect(p.ownerByNode.get("n-gmail")).toBe(CREATOR); // never silently 'carol' or an arbitrary row
    expect(p.allTeamRunnable).toBe(false);
  });

  it("stale binding for a DIFFERENT provider is ignored", async () => {
    mockShared.mockResolvedValue(new Set(["alice"]));
    mockBindings.mockResolvedValue([{ nodeId: "n-gmail", provider: "google-drive", connectorUserId: "zzz" }]);
    const p = await plan();
    expect(p.ownerByNode.get("n-gmail")).toBe("alice"); // single-sharer, not the mismatched binding
  });

  it("mixed providers: all single-shared → allTeamRunnable", async () => {
    mockShared.mockImplementation(async (_acc: string, provider: string) =>
      provider === "gmail" ? new Set(["alice"]) : new Set(["bob"]),
    );
    const p = await plan({ nodes: [{ id: "t", provider: "native" }, gmailNode, { id: "n-drive", provider: "google-drive" }] });
    expect(p.allTeamRunnable).toBe(true);
    expect(p.ownerByNode.get("n-gmail")).toBe("alice");
    expect(p.ownerByNode.get("n-drive")).toBe("bob");
  });

  it("mixed providers: one unresolved blocks allTeamRunnable", async () => {
    mockShared.mockImplementation(async (_acc: string, provider: string) =>
      provider === "gmail" ? new Set(["alice"]) : new Set(), // drive unshared
    );
    const p = await plan({ nodes: [{ id: "t", provider: "native" }, gmailNode, { id: "n-drive", provider: "google-drive" }] });
    expect(p.allTeamRunnable).toBe(false);
  });

  it("NO LEAK: ownerByNode holds user ids for INTERNAL use; reads select no token/scope (covered by repo tests)", async () => {
    mockShared.mockResolvedValue(new Set(["alice"]));
    const p = await plan();
    // The plan is never serialized to a client — it carries owner user ids by design
    // (the engine pins by user). Assert it exposes ONLY the documented shape.
    expect(Object.keys(p).sort()).toEqual(["allTeamRunnable", "ownerByNode", "resolutions"]);
  });
});
