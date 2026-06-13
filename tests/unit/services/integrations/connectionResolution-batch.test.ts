/**
 * @jest-environment node
 *
 * Tests for the CS-5b BATCHED credential-plan builder
 * (`buildWorkflowCredentialPlansBatch`) — the workflows-dashboard counterpart to
 * the per-workflow `buildWorkflowCredentialPlan`. Proves:
 *   - it resolves the SAME `allTeamRunnable` decision per workflow as the single
 *     builder (single-sharer / ambiguous / valid binding / unshared / accepted grant);
 *   - it does so in BOUNDED queries — each batched repo is called EXACTLY ONCE for
 *     the whole list (not once per workflow);
 *   - records with no private providers get a runnable plan with NO query attributed.
 * The three batched reads are mocked; the pure precedence runs for real.
 */
const mockAcceptedBatch = jest.fn();
const mockBindingsBatch = jest.fn();
const mockSharedBatch = jest.fn();

jest.mock("@/services/teamCredentials/nodeCredentialOwners", () => ({
  loadAcceptedNodeOwners: jest.fn(),
  loadAcceptedNodeOwnersBatch: (...a: unknown[]) => mockAcceptedBatch(...a),
}));
jest.mock("@/repositories/workflowNodeConnectorBindings", () => ({
  listByWorkflowServiceRole: jest.fn(),
  listByWorkflowsServiceRole: (...a: unknown[]) => mockBindingsBatch(...a),
}));
jest.mock("@/repositories/integrations", () => ({
  listSharedConnectorUserIdsServiceRole: jest.fn(),
  listSharedConnectorsByProviderServiceRole: (...a: unknown[]) => mockSharedBatch(...a),
}));

import { buildWorkflowCredentialPlansBatch } from "@/services/integrations/connectionResolution";

const CREATOR = "creator-1";

beforeEach(() => {
  jest.clearAllMocks();
  mockAcceptedBatch.mockResolvedValue(new Map()); // no grants
  mockBindingsBatch.mockResolvedValue(new Map()); // no bindings
  mockSharedBatch.mockResolvedValue(new Map()); // no sharers (per-provider sets filled per test)
});

function rec(id: string, nodes: { id: string; provider: string }[], createdBy = CREATOR) {
  return { id, createdByUserId: createdBy, nodes };
}

describe("buildWorkflowCredentialPlansBatch — bounded queries", () => {
  it("calls each batched repo EXACTLY ONCE for many workflows (not 3×N)", async () => {
    mockSharedBatch.mockResolvedValue(new Map([["gmail", new Set(["alice"])]]));
    const records = [
      rec("wf-1", [{ id: "n1", provider: "gmail" }]),
      rec("wf-2", [{ id: "n2", provider: "gmail" }]),
      rec("wf-3", [{ id: "n3", provider: "gmail" }]),
    ];
    await buildWorkflowCredentialPlansBatch({ accountId: "acc-1", records });
    expect(mockSharedBatch).toHaveBeenCalledTimes(1);
    expect(mockAcceptedBatch).toHaveBeenCalledTimes(1);
    expect(mockBindingsBatch).toHaveBeenCalledTimes(1);
    // Shared set queried for the single distinct provider; workflow-keyed reads get all 3 ids.
    expect(mockSharedBatch).toHaveBeenCalledWith("acc-1", ["gmail"]);
    expect(mockAcceptedBatch.mock.calls[0]![0]).toEqual(["wf-1", "wf-2", "wf-3"]);
    expect(mockBindingsBatch.mock.calls[0]![0]).toEqual(["wf-1", "wf-2", "wf-3"]);
  });

  it("no private-provider workflows → runnable plans, ZERO queries", async () => {
    const records = [
      rec("wf-native", [{ id: "t", provider: "native" }]),
      rec("wf-account", [{ id: "a", provider: "slack" }]),
    ];
    const plans = await buildWorkflowCredentialPlansBatch({ accountId: "acc-1", records });
    expect(plans.get("wf-native")!.allTeamRunnable).toBe(true);
    expect(plans.get("wf-account")!.allTeamRunnable).toBe(true);
    expect(mockSharedBatch).not.toHaveBeenCalled();
    expect(mockAcceptedBatch).not.toHaveBeenCalled();
    expect(mockBindingsBatch).not.toHaveBeenCalled();
  });
});

describe("buildWorkflowCredentialPlansBatch — per-workflow resolution (matches the single builder)", () => {
  it("single shared connector → runnable; ambiguous (2 sharers, no binding) → blocked; unshared → blocked", async () => {
    mockSharedBatch.mockResolvedValue(new Map([["gmail", new Set(["alice", "bob"])], ["google-drive", new Set(["carol"])]]));
    const plans = await buildWorkflowCredentialPlansBatch({
      accountId: "acc-1",
      records: [
        rec("wf-single", [{ id: "n", provider: "google-drive" }]), // 1 sharer → runnable
        rec("wf-ambig", [{ id: "n", provider: "gmail" }]),          // 2 sharers, no binding → blocked
        rec("wf-unshared", [{ id: "n", provider: "outlook" }]),     // 0 sharers → blocked
      ],
    });
    expect(plans.get("wf-single")!.allTeamRunnable).toBe(true);
    expect(plans.get("wf-ambig")!.allTeamRunnable).toBe(false);
    expect(plans.get("wf-unshared")!.allTeamRunnable).toBe(false);
  });

  it("valid node binding for an ambiguous provider → runnable (bound connector owns the node)", async () => {
    mockSharedBatch.mockResolvedValue(new Map([["gmail", new Set(["alice", "bob"])]]));
    mockBindingsBatch.mockResolvedValue(
      new Map([["wf-bound", [{ nodeId: "n", provider: "gmail", connectorUserId: "bob" }]]]),
    );
    const plans = await buildWorkflowCredentialPlansBatch({
      accountId: "acc-1",
      records: [rec("wf-bound", [{ id: "n", provider: "gmail" }])],
    });
    expect(plans.get("wf-bound")!.allTeamRunnable).toBe(true);
    expect(plans.get("wf-bound")!.ownerByNode.get("n")).toBe("bob");
  });

  it("accepted grant beats binding + share for the right workflow only", async () => {
    mockSharedBatch.mockResolvedValue(new Map([["gmail", new Set(["alice", "bob"])]]));
    mockAcceptedBatch.mockResolvedValue(new Map([["wf-grant", new Map([["n", "grantOwner"]])]]));
    const plans = await buildWorkflowCredentialPlansBatch({
      accountId: "acc-1",
      records: [
        rec("wf-grant", [{ id: "n", provider: "gmail" }]),
        rec("wf-ambig", [{ id: "n", provider: "gmail" }]),
      ],
    });
    expect(plans.get("wf-grant")!.ownerByNode.get("n")).toBe("grantOwner");
    expect(plans.get("wf-grant")!.allTeamRunnable).toBe(true);
    expect(plans.get("wf-ambig")!.allTeamRunnable).toBe(false); // no grant → still ambiguous
  });
});
