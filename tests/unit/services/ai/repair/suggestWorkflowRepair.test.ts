/**
 * @jest-environment node
 *
 * Tests for services/ai/repair/suggestWorkflowRepair.ts (Slice 4.AI-7).
 *
 * Mocks the run repo + AI-2 graph/validation/variables + AI-5 preview. Uses the
 * REAL discovery registry via getNodeSchema (field types / grounding) and
 * derives real action keys so nothing is hardcoded. AI-6 apply is never
 * imported (asserted structurally).
 */
import { readFileSync } from "node:fs";

const mockGetRunById = jest.fn();
const mockGetGraph = jest.fn();
const mockGetValidation = jest.fn();
const mockGetVars = jest.fn();
const mockPreview = jest.fn();

jest.mock("@/repositories/workflowRuns", () => ({
  getById: (...a: unknown[]) => mockGetRunById(...a),
}));
jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetGraph(...a),
  getWorkflowValidationStateForAI: (...a: unknown[]) => mockGetValidation(...a),
}));
jest.mock("@/services/ai/tools/variables", () => ({
  getAvailableVariablesForAI: (...a: unknown[]) => mockGetVars(...a),
}));
jest.mock("@/services/ai/preview", () => ({
  previewWorkflowPatchForAI: (...a: unknown[]) => mockPreview(...a),
}));
// 4.ACCOUNT-MODEL-8: repair resolves the caller's account and compares it to
// the run's account_id. Map userId → `acct-<userId>` so "owner-1" matches the
// run's "acct-owner-1" and any other caller resolves elsewhere → NOT_FOUND.
jest.mock("@/services/accounts/ensurePersonalAccount", () => ({
  ensurePersonalAccount: (userId: string) =>
    Promise.resolve({ id: `acct-${userId}` }),
}));

import { suggestWorkflowRepairForAI } from "@/services/ai/repair/suggestWorkflowRepair";
import { listAllActionMetas } from "@/services/discovery/_registry";

const ok = <T>(data: T) => ({ ok: true as const, data });

// Real action keys (grounded; no hardcoding).
const textAction = listAllActionMetas().find((m) =>
  m.fields.some((f) => f.required && (f.type === "text" || f.type === "textarea")),
)!;
const textField = textAction.fields.find(
  (f) => f.required && (f.type === "text" || f.type === "textarea"),
)!;
const selectAction = listAllActionMetas().find((m) =>
  m.fields.some((f) => f.required && f.type !== "text" && f.type !== "textarea"),
)!;
const selectField = selectAction.fields.find(
  (f) => f.required && f.type !== "text" && f.type !== "textarea",
)!;

function runRec(over: Record<string, unknown> = {}) {
  return {
    id: "run1",
    workflowId: "wf1",
    accountId: "acct-owner-1",
    triggeredByUserId: "owner-1",
    status: "failed",
    triggerNodeId: "t",
    triggerEvent: {},
    steps: [{ nodeId: "a1", status: "failed", error: { code: "HANDLER_FAILED", message: "x" } }],
    fatalError: null,
    errorClassification: null,
    startedAt: "",
    finishedAt: "",
    createdAt: "",
    isTest: false,
    triggeredBy: "manual",
    ...over,
  };
}

function gnode(id: string, kind: string, provider: string, type: string, config: Record<string, unknown> = {}) {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } };
}

function graphView(nodes: unknown[], edges: unknown[]) {
  return ok({
    workflowId: "wf1",
    name: "WF",
    state: "draft",
    activeRevisionId: null,
    updatedAt: "rev-1",
    nodes,
    edges,
  });
}

function validationView(issues: unknown[]) {
  return ok({ workflowId: "wf1", ok: issues.length === 0, issues, coverage: { checked: [], deferredToAI3: [] } });
}

function previewOk(over: Record<string, unknown> = {}) {
  return ok({
    ok: true,
    workflowId: "wf1",
    currentRevision: "rev-1",
    patchId: "repair:run1",
    patchSummary: "",
    validation: { ok: true, errors: [], warnings: [] },
    changes: [],
    affectedNodeIds: [],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    beforeSummary: { trigger: null, steps: [], dataFlow: [], providersUsed: [], requiresIntegrationProviders: [], highRiskNodes: [], unknownNodes: [], summaryText: "", notes: [] },
    userFacingSummaryText: "",
    canApplyLater: true,
    ...over,
  });
}

const INPUT = { userId: "owner-1", workflowId: "wf1", workflowRunId: "run1" };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRunById.mockResolvedValue(runRec());
  mockGetGraph.mockResolvedValue(graphView([gnode("t", "trigger", "gmail", "new_email"), gnode("a1", "action", "gmail", "send_email", { to: "x@y.com" })], [{ id: "e1", from: "t", to: "a1" }]));
  mockGetValidation.mockResolvedValue(validationView([]));
  mockGetVars.mockResolvedValue(ok({ nodeId: "a1", variables: [], triggerAlias: null, unknownUpstreamNodeIds: [], truncated: false }));
  mockPreview.mockResolvedValue(previewOk());
});

describe("suggestWorkflowRepairForAI — loading / ownership", () => {
  it("returns NOT_FOUND when the run is missing", async () => {
    mockGetRunById.mockResolvedValue(null);
    const res = await suggestWorkflowRepairForAI(INPUT);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
    expect(res.noMutation).toBe(true);
  });

  it("returns NOT_FOUND when the run is not owned or not for this workflow", async () => {
    mockGetRunById.mockResolvedValue(runRec({ accountId: "acct-other" }));
    expect((await suggestWorkflowRepairForAI(INPUT)).ok).toBe(false);
    mockGetRunById.mockResolvedValue(runRec({ workflowId: "other" }));
    expect((await suggestWorkflowRepairForAI(INPUT)).ok).toBe(false);
  });

  it("returns noSafeRepair / RUN_NOT_FAILED for a successful run (no graph load)", async () => {
    mockGetRunById.mockResolvedValue(runRec({ status: "succeeded", steps: [] }));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.repairability).toBe("noSafeRepair");
    expect(res.reasonCode).toBe("RUN_NOT_FAILED");
    expect(res.failureSummary.failed).toBe(false);
    expect(mockGetGraph).not.toHaveBeenCalled();
  });

  it("builds a value-free failureSummary for a failed run", async () => {
    mockGetRunById.mockResolvedValue(
      runRec({
        steps: [{ nodeId: "a1", status: "failed", error: { code: "MISSING_HANDLER", message: "raw" } }],
        errorClassification: { title: "No handler", description: "safe", severity: "error" },
      }),
    );
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.failureSummary.failedNodeId).toBe("a1");
    expect(res.failureSummary.errorCode).toBe("MISSING_HANDLER");
    expect(res.failureSummary.classification?.title).toBe("No handler");
    expect(res.noMutation).toBe(true);
  });
});

describe("suggestWorkflowRepairForAI — categories", () => {
  it("disconnected integration → recommendation, no patch", async () => {
    mockGetRunById.mockResolvedValue(
      runRec({ errorClassification: { title: "Reconnect", description: "d", action: "reconnect", severity: "error" } }),
    );
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("DISCONNECTED_INTEGRATION");
    expect(res.repairability).toBe("needsUserInput");
    expect(res.proposedPatch).toBeUndefined();
    expect(res.recommendations.join(" ")).toMatch(/[Rr]econnect/);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("unknown node metadata → noSafeRepair, invents nothing", async () => {
    mockGetValidation.mockResolvedValue(validationView([{ code: "UNKNOWN_NODE_TYPE", nodeId: "a1", message: "x", severity: "error" }]));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("UNKNOWN_NODE_METADATA");
    expect(res.repairability).toBe("noSafeRepair");
    expect(res.proposedPatch).toBeUndefined();
  });

  it("missing required TEXT field → AI_FIELD placeholder patch (no invented value)", async () => {
    expect(textAction).toBeDefined();
    mockGetGraph.mockResolvedValue(graphView([gnode("a1", "action", textAction.provider, textAction.type, {})], []));
    mockGetValidation.mockResolvedValue(validationView([{ code: "MISSING_REQUIRED_FIELD", nodeId: "a1", field: textField.name, message: "x", severity: "error" }]));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("MISSING_REQUIRED_FIELD");
    expect(res.repairability).toBe("repairable");
    expect(res.proposedPatch?.operations[0]).toEqual({
      op: "updateNodeConfig",
      nodeId: "a1",
      config: { [textField.name]: `{{AI_FIELD:${textField.name}}}` },
    });
    expect(res.proposedPatch?.baseRevision).toBe("rev-1");
    expect(res.proposedPatch?.patchId).toBe("repair:run1");
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(res.preview).toBeDefined();
  });

  it("missing required non-text field → needsUserInput (never invents a value)", async () => {
    expect(selectAction).toBeDefined();
    mockGetGraph.mockResolvedValue(graphView([gnode("a1", "action", selectAction.provider, selectAction.type, {})], []));
    mockGetValidation.mockResolvedValue(validationView([{ code: "MISSING_REQUIRED_FIELD", nodeId: "a1", field: selectField.name, message: "x", severity: "error" }]));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.repairability).toBe("needsUserInput");
    expect(res.requiredUserInput.some((u) => u.field === selectField.name)).toBe(true);
    expect(res.proposedPatch).toBeUndefined();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("invalid variable reference with one clear upstream replacement → repairVariableReference", async () => {
    mockGetRunById.mockResolvedValue(
      runRec({ steps: [{ nodeId: "a2", status: "failed", error: { code: "MISSING_VARIABLE", message: "x", details: { path: "ghost.x" } } }] }),
    );
    mockGetGraph.mockResolvedValue(
      graphView([gnode("t", "trigger", "gmail", "new_email"), gnode("a1", "action", "gmail", "send_email", {}), gnode("a2", "action", "gmail", "send_email", { subject: "{{ghost.x}}" })], [{ id: "e1", from: "t", to: "a1" }, { id: "e2", from: "a1", to: "a2" }]),
    );
    mockGetVars.mockResolvedValue(ok({ nodeId: "a2", variables: [{ nodeId: "a1", nodeType: "gmail:send_email", nodeKind: "action", path: "x", reference: "{{a1.x}}", type: "string", sensitive: false }], triggerAlias: null, unknownUpstreamNodeIds: [], truncated: false }));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("INVALID_VARIABLE_REFERENCE");
    expect(res.repairability).toBe("repairable");
    expect(res.proposedPatch?.operations[0]).toEqual({ op: "repairVariableReference", nodeId: "a2", fieldPath: "subject", newReference: "{{a1.x}}" });
  });

  it("invalid variable reference with no clear replacement → needsUserInput", async () => {
    mockGetRunById.mockResolvedValue(
      runRec({ steps: [{ nodeId: "a2", status: "failed", error: { code: "MISSING_VARIABLE", message: "x", details: { path: "ghost.x" } } }] }),
    );
    mockGetGraph.mockResolvedValue(
      graphView([gnode("t", "trigger", "gmail", "new_email"), gnode("a2", "action", "gmail", "send_email", { subject: "{{ghost.x}}" })], [{ id: "e1", from: "t", to: "a2" }]),
    );
    mockGetVars.mockResolvedValue(ok({ nodeId: "a2", variables: [], triggerAlias: null, unknownUpstreamNodeIds: [], truncated: false }));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.repairability).toBe("needsUserInput");
    expect(res.proposedPatch).toBeUndefined();
  });

  it("downstream variable reference → needsUserInput", async () => {
    mockGetValidation.mockResolvedValue(validationView([{ code: "DOWNSTREAM_VARIABLE_REFERENCE", nodeId: "a1", message: "x", severity: "error" }]));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("INVALID_VARIABLE_REFERENCE");
    expect(res.repairability).toBe("needsUserInput");
  });

  it("dangling edge → removeEdge patch", async () => {
    mockGetGraph.mockResolvedValue(graphView([gnode("t", "trigger", "gmail", "new_email"), gnode("a1", "action", "gmail", "send_email", { to: "x" })], [{ id: "e9", from: "a1", to: "ghost" }]));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("INVALID_EDGE");
    expect(res.proposedPatch?.operations).toEqual([{ op: "removeEdge", edgeId: "e9" }]);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("missing trigger → needsUserInput", async () => {
    mockGetGraph.mockResolvedValue(graphView([gnode("a1", "action", "gmail", "send_email", { to: "x" })], []));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("MISSING_TRIGGER");
    expect(res.repairability).toBe("needsUserInput");
  });

  it("no recognizable category → noSafeRepair / NO_DETERMINISTIC_REPAIR", async () => {
    const res = await suggestWorkflowRepairForAI(INPUT); // default: HANDLER_FAILED, no validation issues, has trigger
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("NO_DETERMINISTIC_REPAIR");
    expect(res.repairability).toBe("noSafeRepair");
  });
});

describe("suggestWorkflowRepairForAI — preview integration", () => {
  it("downgrades to noSafeRepair / FAILED_PREVIEW when the preview rejects the patch", async () => {
    mockGetGraph.mockResolvedValue(graphView([gnode("a1", "action", "gmail", "send_email", { to: "x" })], [{ id: "e9", from: "a1", to: "ghost" }]));
    mockPreview.mockResolvedValue(previewOk({ ok: false, blockedReason: "INVALID_EDGE: bad", canApplyLater: false }));
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    expect(res.reasonCode).toBe("FAILED_PREVIEW");
    expect(res.repairability).toBe("noSafeRepair");
    expect(res.proposedPatch).toBeUndefined();
    expect(res.safetyNotes.join(" ")).toMatch(/Preview rejected/);
  });

  it("never imports the AI-6 apply service (no-apply guarantee)", () => {
    const orchestrator = readFileSync("services/ai/repair/suggestWorkflowRepair.ts", "utf8");
    const strategies = readFileSync("services/ai/repair/repairStrategies.ts", "utf8");
    expect(orchestrator).not.toMatch(/services\/ai\/apply/);
    expect(strategies).not.toMatch(/services\/ai\/apply/);
    expect(orchestrator).not.toMatch(/applyWorkflowPatch/);
  });
});

describe("suggestWorkflowRepairForAI — no leak", () => {
  it("never surfaces raw step output / error message / PII", async () => {
    mockGetRunById.mockResolvedValue(
      runRec({
        steps: [
          {
            nodeId: "a1",
            status: "failed",
            output: { accessToken: "ACCESS-aaa", body: "private body" },
            error: { code: "HANDLER_FAILED", message: "failed Bearer SECRET-ggg for victim@example.com" },
          },
        ],
        errorClassification: { title: "Step failed", description: "A step failed.", severity: "error" },
      }),
    );
    const res = await suggestWorkflowRepairForAI(INPUT);
    if (!res.ok) throw new Error("expected ok");
    const serialized = JSON.stringify(res);
    for (const v of ["ACCESS-aaa", "private body", "Bearer SECRET-ggg", "victim@example.com"]) {
      expect(serialized).not.toContain(v);
    }
  });
});
