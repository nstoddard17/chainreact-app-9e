/**
 * @jest-environment node
 *
 * Tests for the `diagnoseWorkflowReadiness` capability service
 * (Slice 4.MCP-STAGE-2B-3 extraction).
 *
 * Called DIRECTLY (no HTTP, no gate) — the gate is the route's job. These prove
 * the capability owns membership authz + sanitized DTO assembly, runs the REAL
 * `checkWorkflowReadiness`, and never leaks config/secret values.
 */

const mockGetWorkflow = jest.fn();
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...a: unknown[]) => mockGetWorkflow(...a),
}));

const mockIsMember = jest.fn();
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
}));

const mockGetProvider = jest.fn();
jest.mock("@/integrations/_registry", () => ({
  getProvider: (...a: unknown[]) => mockGetProvider(...a),
}));

import { diagnoseWorkflowReadiness } from "@/services/diagnostics/workflowReadiness";

const ACCT = "acct-1";

function workflow(nodes: unknown[], edges: unknown[] = []) {
  return {
    id: "wf-1",
    name: "Secret Workflow Name",
    accountId: ACCT,
    createdByUserId: "creator-SECRET-42",
    draftDefinition: { nodes, edges },
    definition: { nodes: [], edges: [] },
  };
}

const triggerNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "slack",
  type: "message_posted",
  displayName: "Slack Message",
  config: { channel: "C-SECRET-CHANNEL" },
};
const gmailAction = {
  id: "action-1",
  kind: "action",
  provider: "gmail",
  type: "send_email",
  displayName: "Send Email",
  config: { apiKey: "SECRET_VALUE", to: "victim@example.com" },
};

beforeEach(() => {
  mockGetWorkflow.mockReset();
  mockIsMember.mockReset();
  mockIsMember.mockResolvedValue(true);
  mockGetProvider.mockReset();
  mockGetProvider.mockImplementation((id: string) =>
    id === "slack"
      ? { id: "slack", displayName: "Slack", isEnabled: true }
      : id === "gmail"
        ? { id: "gmail", displayName: "Gmail", isEnabled: true }
        : undefined,
  );
});

const call = (workflowId = "wf-1", subjectUserId = "u1") =>
  diagnoseWorkflowReadiness({ subjectUserId, workflowId });

describe("diagnoseWorkflowReadiness — NOT_FOUND", () => {
  it("returns NOT_FOUND and does NOT call membership", async () => {
    mockGetWorkflow.mockResolvedValue(null);
    expect(await call("missing")).toEqual({ workflowId: "missing", access: "NOT_FOUND" });
    expect(mockIsMember).not.toHaveBeenCalled();
  });
});

describe("diagnoseWorkflowReadiness — NO_ACCOUNT_ACCESS reveals nothing", () => {
  it("a non-member gets exactly {workflowId, access} — no readiness/providers/nodes/config", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([triggerNode, gmailAction]));
    mockIsMember.mockResolvedValue(false);
    const result = await call("wf-1", "intruder");
    expect(result).toEqual({ workflowId: "wf-1", access: "NO_ACCOUNT_ACCESS" });
    expect(mockGetWorkflow).toHaveBeenCalledWith("wf-1");
    expect(mockIsMember).toHaveBeenCalledWith(ACCT, "intruder");
    const json = JSON.stringify(result);
    for (const forbidden of [
      "Send Email",
      "action-1",
      "gmail",
      "SECRET_VALUE",
      "victim@example.com",
      "C-SECRET-CHANNEL",
      "Secret Workflow Name",
      "creator-SECRET-42",
      ACCT,
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const k of ["runnable", "graphIssues", "fieldGaps", "providers", "readinessError"]) {
      expect(result).not.toHaveProperty(k);
    }
  });
});

describe("diagnoseWorkflowReadiness — authorized mapping", () => {
  it("clean workflow → runnable:true, empty issues, deduped provider inventory", async () => {
    // Synthetic provider/type unknown to the discovery registry → no required
    // fields. trigger + reachable action → valid graph.
    const synthTrigger = { id: "trigger-1", kind: "trigger", provider: "synthetic", type: "noop", displayName: "Start", config: {} };
    const synthAction = { id: "action-1", kind: "action", provider: "synthetic", type: "noop2", displayName: "Do", config: {} };
    mockGetProvider.mockReturnValue(undefined);
    mockGetWorkflow.mockResolvedValue(
      workflow([synthTrigger, synthAction], [{ id: "e1", from: "trigger-1", to: "action-1" }]),
    );
    const result = await call();
    expect(result).toMatchObject({
      workflowId: "wf-1",
      access: "OK",
      runnable: true,
      readinessError: null,
      graphIssues: [],
      fieldGaps: [],
    });
    expect(result.providers).toEqual([{ provider: "synthetic", name: null, enabled: false }]);
  });

  it("no trigger → INVALID_WORKFLOW_GRAPH with no_trigger code, runnable:false", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([{ ...gmailAction, config: {} }]));
    const result = await call();
    expect(result.access).toBe("OK");
    expect(result.runnable).toBe(false);
    expect(result.readinessError).toBe("INVALID_WORKFLOW_GRAPH");
    expect(result.graphIssues!.some((g) => g.code === "no_trigger")).toBe(true);
    expect(result.fieldGaps).toEqual([]); // graph-first precedence
  });

  it("unreachable node → graph issue with code + nodeId + displayName only (no message)", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([triggerNode, { ...gmailAction, config: {} }]));
    const result = await call();
    const issue = result.graphIssues!.find((g) => g.code === "unreachable_node");
    expect(issue).toMatchObject({ code: "unreachable_node", nodeId: "action-1", displayName: "Send Email" });
    expect(Object.keys(issue!).sort()).toEqual(["code", "displayName", "nodeId"]);
    expect(issue).not.toHaveProperty("message");
  });

  it("missing required fields → MISSING_REQUIRED_FIELDS with field LABELS only", async () => {
    // gmail send_email has real required fields; gmailAction.config lacks them →
    // a field gap, with a valid (connected) graph.
    mockGetWorkflow.mockResolvedValue(
      workflow([triggerNode, gmailAction], [{ id: "e1", from: "trigger-1", to: "action-1" }]),
    );
    const result = await call();
    expect(result.access).toBe("OK");
    // Regardless of the exact required-field set, the verdict must never leak config.
    const json = JSON.stringify(result);
    expect(json).not.toContain("SECRET_VALUE");
    expect(json).not.toContain("victim@example.com");
    expect(json).not.toContain("C-SECRET-CHANNEL");
    if (result.readinessError === "MISSING_REQUIRED_FIELDS") {
      for (const gap of result.fieldGaps!) {
        expect(Object.keys(gap).sort()).toEqual(["missingFields", "nodeId", "nodeName"]);
      }
    }
  });
});

describe("diagnoseWorkflowReadiness — no-leak on the authorized path", () => {
  it("config values, workflow name, and creator id never reach the returned object", async () => {
    mockGetWorkflow.mockResolvedValue(workflow([triggerNode, gmailAction]));
    const json = JSON.stringify(await call());
    for (const forbidden of [
      "SECRET_VALUE",
      "victim@example.com",
      "C-SECRET-CHANNEL",
      "Secret Workflow Name",
      "creator-SECRET-42",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).toContain("slack");
    expect(json).toContain("gmail");
  });
});

describe("diagnoseWorkflowReadiness — invalid variable references (AI-REPAIR-3G)", () => {
  const BROKEN = "{{e25b1c45-af99-4913-9947-f726012329a5.email}}";

  it("flags a deleted-node reference in a config field — token + nodeId only, no value", async () => {
    const gmailBrokenRef = {
      id: "gmail-1",
      kind: "action",
      provider: "gmail",
      type: "send_email",
      displayName: "Send Email",
      config: { to: BROKEN, subject: "Static subject" },
    };
    mockGetWorkflow.mockResolvedValue(
      workflow([triggerNode, gmailBrokenRef], [{ id: "e1", from: "trigger-1", to: "gmail-1" }]),
    );
    const result = await call();
    expect(result.access).toBe("OK");
    expect(result.invalidVariableRefs).toEqual([
      { nodeId: "gmail-1", fieldLabel: expect.any(String), token: BROKEN },
    ]);
  });

  it("is empty when every reference resolves (trigger alias / existing node)", async () => {
    mockGetWorkflow.mockResolvedValue(
      workflow([triggerNode, gmailAction], [{ id: "e1", from: "trigger-1", to: "action-1" }]),
    );
    const result = await call();
    expect(result.invalidVariableRefs).toEqual([]);
  });
});
