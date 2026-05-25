/**
 * @jest-environment node
 *
 * Tests for services/ai/explain/explainWorkflow.ts (Slice 4.AI-4).
 *
 * Mocks the AI-2 context tools so we assert the explainer's composition +
 * deterministic narration + error propagation in isolation.
 */
const mockGetWorkflowSummaryForAI = jest.fn();
const mockGetWorkflowGraphForAI = jest.fn();
const mockGetWorkflowValidationStateForAI = jest.fn();
const mockGetActionMeta = jest.fn();
const mockGetTriggerMeta = jest.fn();

jest.mock("@/services/ai/tools/workflowContext", () => ({
  getWorkflowSummaryForAI: (...a: unknown[]) => mockGetWorkflowSummaryForAI(...a),
  getWorkflowGraphForAI: (...a: unknown[]) => mockGetWorkflowGraphForAI(...a),
  getWorkflowValidationStateForAI: (...a: unknown[]) => mockGetWorkflowValidationStateForAI(...a),
}));
jest.mock("@/services/ai/tools/providerCatalog", () => ({
  getActionMeta: (...a: unknown[]) => mockGetActionMeta(...a),
  getTriggerMeta: (...a: unknown[]) => mockGetTriggerMeta(...a),
}));

import { explainWorkflowForAI } from "@/services/ai/explain/explainWorkflow";

const ok = <T>(data: T) => ({ ok: true as const, data });
const err = (code: string, message: string) => ({ ok: false as const, code, message });

function defaultSummary() {
  return ok({
    workflowId: "wf-1",
    name: "Lead to Slack",
    state: "draft",
    nodeCount: 3,
    edgeCount: 2,
    isEmpty: false,
    hasTrigger: true,
    trigger: { nodeId: "n1", key: "gmail:new_email", displayName: "New Email", activation: "polling" },
    actions: [
      { nodeId: "n2", key: "slack:send_channel_message", displayName: "Send Channel Message" },
      { nodeId: "n3", key: "native:delay", displayName: "Delay" },
    ],
    providersUsed: ["gmail", "native", "slack"],
    requiresIntegrationProviders: ["gmail", "slack"],
    highRiskNodes: [],
    unknownNodes: [],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWorkflowGraphForAI.mockResolvedValue(
    ok({
      workflowId: "wf-1",
      name: "Lead to Slack",
      state: "draft",
      activeRevisionId: null,
      updatedAt: "2026-05-25T00:00:00Z",
      nodes: [],
      edges: [
        { id: "e1", from: "n1", to: "n2" },
        { id: "e2", from: "n2", to: "n3", label: "ok" },
      ],
    }),
  );
  mockGetWorkflowValidationStateForAI.mockResolvedValue(
    ok({
      workflowId: "wf-1",
      ok: true,
      issues: [],
      coverage: { checked: ["structural_schema"], deferredToAI3: ["x"] },
    }),
  );
  mockGetActionMeta.mockImplementation((key: string) =>
    ok({ key, description: `Does ${key}`, riskLevel: "low", requiresIntegration: key.startsWith("slack") }),
  );
  mockGetTriggerMeta.mockImplementation((key: string) =>
    ok({ key, description: `Fires on ${key}` }),
  );
});

describe("explainWorkflowForAI", () => {
  it("builds a grounded explanation with trigger, steps, data flow, and narration", async () => {
    mockGetWorkflowSummaryForAI.mockResolvedValue(defaultSummary());
    const res = await explainWorkflowForAI("u1", "wf-1");
    if (!res.ok) throw new Error("expected ok");

    expect(res.data.trigger).toEqual({
      nodeId: "n1",
      key: "gmail:new_email",
      displayName: "New Email",
      description: "Fires on gmail:new_email",
      activation: "polling",
    });
    expect(res.data.steps.map((s) => s.displayName)).toEqual(["Send Channel Message", "Delay"]);
    expect(res.data.steps[0]!.description).toBe("Does slack:send_channel_message");
    expect(res.data.dataFlow).toEqual([
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3", label: "ok" },
    ]);
    expect(res.data.summaryText).toContain("New Email");
    expect(res.data.summaryText).toContain("Send Channel Message → Delay");
    expect(res.data.summaryText).toContain("currently valid");
    expect(res.data.notes.some((n) => n.includes("gmail, slack"))).toBe(true);
  });

  it("propagates NOT_FOUND from the summary tool (ownership/missing)", async () => {
    mockGetWorkflowSummaryForAI.mockResolvedValue(err("NOT_FOUND", "No workflow 'wf-x'."));
    const res = await explainWorkflowForAI("u1", "wf-x");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("NOT_FOUND");
  });

  it("handles a workflow with no trigger", async () => {
    const s = defaultSummary();
    mockGetWorkflowSummaryForAI.mockResolvedValue(
      ok({ ...s.data, trigger: null, hasTrigger: false }),
    );
    const res = await explainWorkflowForAI("u1", "wf-1");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.trigger).toBeNull();
    expect(res.data.notes.some((n) => n.includes("no trigger"))).toBe(true);
    expect(res.data.summaryText).toContain("manually");
  });

  it("surfaces unknown nodes in notes", async () => {
    const s = defaultSummary();
    mockGetWorkflowSummaryForAI.mockResolvedValue(
      ok({ ...s.data, unknownNodes: [{ nodeId: "n9", key: "madeup:nope" }] }),
    );
    const res = await explainWorkflowForAI("u1", "wf-1");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.unknownNodes).toHaveLength(1);
    expect(res.data.notes.some((n) => n.includes("unrecognized"))).toBe(true);
  });

  it("degrades gracefully when validation is unavailable (does not fail)", async () => {
    mockGetWorkflowSummaryForAI.mockResolvedValue(defaultSummary());
    mockGetWorkflowValidationStateForAI.mockResolvedValue(err("SERVER_ERROR", "down"));
    const res = await explainWorkflowForAI("u1", "wf-1");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.validation.available).toBe(false);
    expect(res.data.summaryText).not.toContain("currently valid");
  });

  it("reports validation errors in the validation section", async () => {
    mockGetWorkflowSummaryForAI.mockResolvedValue(defaultSummary());
    mockGetWorkflowValidationStateForAI.mockResolvedValue(
      ok({
        workflowId: "wf-1",
        ok: false,
        issues: [
          { code: "MISSING_REQUIRED_FIELD", message: "Node 'n2' is missing required field 'channelId'.", severity: "error" },
          { code: "INTEGRATION_CHECK_UNAVAILABLE", message: "x", severity: "warning" },
        ],
        coverage: { checked: [], deferredToAI3: [] },
      }),
    );
    const res = await explainWorkflowForAI("u1", "wf-1");
    if (!res.ok) throw new Error("expected ok");
    expect(res.data.validation.errorCount).toBe(1);
    expect(res.data.validation.warningCount).toBe(1);
    expect(res.data.summaryText).toContain("1 issue");
  });
});
