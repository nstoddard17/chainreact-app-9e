/**
 * @jest-environment node
 *
 * Tests for the CS-3a eligibility service
 * (services/integrations/connectionSharingEligibility.computeWorkflowSharingEligibility).
 *
 * The pure core (`computeRunEditEligibility`) runs for real; the repo read + flag
 * are mocked. Covers: flag-OFF no-I/O WF-RUNPERM parity, creator / no-private
 * short-circuit (no DB read), single/ambiguous/unshared resolution, the per-
 * provider read fan-out, and a no-leak check that connector ids never appear in
 * the result.
 */
const mockListShared = jest.fn();
const mockFlag = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  listSharedConnectorUserIdsServiceRole: (...a: unknown[]) => mockListShared(...a),
}));
jest.mock("@/services/integrations/connectionSharingFlags", () => ({
  isConnectionSharingEnabled: () => mockFlag(),
}));

import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { computeWorkflowSharingEligibility } from "@/services/integrations/connectionSharingEligibility";

let seq = 0;
function def(...providers: string[]): WorkflowDefinition {
  seq = 0;
  return {
    nodes: providers.map((p, i) => ({
      id: `n${seq++}`,
      kind: i === 0 ? "trigger" : "action",
      provider: p,
      type: "x",
      config: {},
      position: { x: 0, y: 0 },
    })),
    edges: [],
  } as WorkflowDefinition;
}

const ACCOUNT = "acc-1";
const CREATOR = "creator-1";
const OTHER = "member-2";

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag.mockReturnValue(true);
});

describe("computeWorkflowSharingEligibility", () => {
  it("flag OFF ⇒ NO DB read; WF-RUNPERM parity (private non-creator blocked)", async () => {
    mockFlag.mockReturnValue(false);
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "gmail"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    expect(res).toEqual({ allowed: false, reason: "flag_off_legacy", providerStatuses: [] });
    expect(mockListShared).not.toHaveBeenCalled();
  });

  it("flag OFF, no private ⇒ allowed, no DB read", async () => {
    mockFlag.mockReturnValue(false);
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "slack"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe("flag_off_legacy");
    expect(mockListShared).not.toHaveBeenCalled();
  });

  it("flag ON, creator ⇒ allowed WITHOUT a DB read (short-circuit)", async () => {
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "gmail"), createdByUserId: CREATOR, callerUserId: CREATOR,
    });
    expect(res).toEqual({ allowed: true, reason: "creator", providerStatuses: [] });
    expect(mockListShared).not.toHaveBeenCalled();
  });

  it("flag ON, no private providers ⇒ allowed WITHOUT a DB read", async () => {
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "slack"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    expect(res.reason).toBe("no_private_credentials");
    expect(mockListShared).not.toHaveBeenCalled();
  });

  it("flag ON, non-creator, ONE shared connector ⇒ eligible; reads exactly that provider", async () => {
    mockListShared.mockResolvedValue(new Set(["connector-A"]));
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "gmail"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe("all_providers_single_shared");
    expect(mockListShared).toHaveBeenCalledWith(ACCOUNT, "gmail");
    expect(mockListShared).toHaveBeenCalledTimes(1);
  });

  it("flag ON, non-creator, TWO shared connectors ⇒ blocked_ambiguous", async () => {
    mockListShared.mockResolvedValue(new Set(["connector-A", "connector-B"]));
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "gmail"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("blocked_ambiguous");
  });

  it("flag ON, non-creator, ZERO shared ⇒ blocked_unshared", async () => {
    mockListShared.mockResolvedValue(new Set());
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "gmail"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("blocked_unshared");
  });

  it("flag ON, mixed providers: reads each provider once; all single ⇒ eligible", async () => {
    mockListShared.mockImplementation(async (_acc: string, provider: string) =>
      provider === "gmail" ? new Set(["A"]) : new Set(["B"]),
    );
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT,
      definition: def("native", "gmail", "google-drive"),
      createdByUserId: CREATOR,
      callerUserId: OTHER,
    });
    expect(res.allowed).toBe(true);
    const providersRead = mockListShared.mock.calls.map((c) => c[1]).sort();
    expect(providersRead).toEqual(["gmail", "google-drive"]);
  });

  it("NO LEAK: connector ids from the repo never appear in the result", async () => {
    mockListShared.mockResolvedValue(new Set(["secret-connector-id-xyz", "secret-connector-id-2"]));
    const res = await computeWorkflowSharingEligibility({
      accountId: ACCOUNT, definition: def("native", "gmail"), createdByUserId: CREATOR, callerUserId: OTHER,
    });
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain("secret-connector-id-xyz");
    expect(serialized).not.toContain("secret-connector-id-2");
  });
});
