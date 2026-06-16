/**
 * Integration tests for AI-REPAIR-3E — the Apply button on a validated repair preview
 * inside BuilderAiPanel. `@/lib/api/ai` + `@/lib/api/workflows` are mocked (no network).
 *
 * Proves: Apply shows ONLY on an applyable preview (not Check cards / proposals / blocked
 * previews); an explicit click calls the 3D apply route with the opaque operations +
 * baseRevision (no model call); success shows "Applied fix. Workflow not run." and
 * refetches/hydrates the draft; stale/blocked/network show safe copy with NO graph
 * mutation; the button is disabled while pending (no double-submit).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDiagnose = jest.fn();
const mockRepair = jest.fn();
const mockPreview = jest.fn();
const mockExplain = jest.fn();
const mockApply = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: jest.fn(),
    applyWorkflowPatch: jest.fn(),
    diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
    explainDiagnosis: (...a: unknown[]) => mockExplain(...a),
    planWorkflowRepair: (...a: unknown[]) => mockRepair(...a),
    previewWorkflowRepair: (...a: unknown[]) => mockPreview(...a),
    applyWorkflowRepair: (...a: unknown[]) => mockApply(...a),
    getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
    appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
    clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
    AI_CREDITS_EXHAUSTED_MESSAGE: actual.AI_CREDITS_EXHAUSTED_MESSAGE,
    AiApiError: class AiApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.name = "AiApiError";
        this.status = status;
      }
    },
  };
});

const mockGetWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({ getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a) }));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const issueDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "This workflow can't run yet.",
  nextSteps: ["Fix the reference."],
  findings: [{ source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", provider: "gmail" }],
};

const proposalOk = {
  ok: true,
  proposal: { summary: "Repair the reference.", recommendedActions: ["Repair it"], affectedNodes: ["Gmail — Send Email"], missingInfo: [], riskLevel: "low", canAutoPatchLater: true, requiresUserAction: false, notAppliedNotice: "x" },
};

const APPLY_OPS = [{ op: "repairVariableReference", nodeId: "n1", fieldPath: "body", newReference: "{{n0.OPAQUE_REF}}" }];

const previewApplyable = {
  ok: true,
  preview: {
    ok: true,
    patchSummary: "Repair the reference.",
    changes: [{ op: "repairVariableReference", description: 'Repairs variable reference in field "body".', nodeId: "node-INTERNAL-A", fields: ["body"] }],
    affectedNodeIds: ["node-INTERNAL-A"],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: { ok: true, errors: [], warnings: [] },
    userFacingSummaryText: "Repair the reference — 1 change(s). Risk: low.",
    candidateSummary: "2 node(s)",
    canApplyLater: true,
    apply: { applyable: true, operations: APPLY_OPS, baseRevision: "rev-1" },
  },
  notAppliedNotice: "x",
};

const previewBlocked = {
  ok: true,
  preview: {
    ok: false,
    patchSummary: "Repair.",
    changes: [],
    affectedNodeIds: [],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: { ok: false, errors: [{ code: "UNKNOWN_NODE", message: "no longer in the workflow" }], warnings: [] },
    userFacingSummaryText: "BLOCKED — 1 error(s).",
    canApplyLater: false,
    blockedReason: "no longer in the workflow",
    apply: { applyable: false },
  },
  notAppliedNotice: "x",
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(issueDiagnosis);
  mockRepair.mockReset();
  mockRepair.mockResolvedValue(proposalOk);
  mockPreview.mockReset();
  mockPreview.mockResolvedValue(previewApplyable);
  mockExplain.mockReset();
  mockApply.mockReset();
  mockApply.mockResolvedValue({ ok: true, applied: true, currentRevision: "rev-2", appliedOperations: [{ op: "repairVariableReference", nodeId: "node-INTERNAL-A", fields: ["body"] }] });
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({ thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" }, messages: [] });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  mockGetWorkflow.mockReset();
  mockGetWorkflow.mockResolvedValue({ id: "wf-1", draftDefinition: { nodes: [], edges: [] }, updatedAt: "rev-2" });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

async function check() {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

/** Check → Suggest → Preview → the applyable repair-preview bubble is up. */
async function preview() {
  const user = await check();
  await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
  await screen.findByTestId("builder-ai-repair-proposal");
  await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
  await screen.findByTestId("builder-ai-repair-preview");
  return user;
}

describe("Apply — visibility", () => {
  it("does NOT appear on the Check diagnosis card", async () => {
    await check();
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
  });

  it("does NOT appear on a blocked preview", async () => {
    const user = await check();
    await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
    await screen.findByTestId("builder-ai-repair-proposal");
    mockPreview.mockResolvedValueOnce(previewBlocked);
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview-blocked");
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
  });

  it("appears on an applyable preview", async () => {
    await preview();
    expect(screen.getByTestId("builder-ai-repair-apply-button").textContent).toBe("Apply fix");
  });
});

describe("Apply — click + success", () => {
  it("calls the apply route with the opaque operations + baseRevision; no model call", async () => {
    const user = await preview();
    const before = { d: mockDiagnose.mock.calls.length, r: mockRepair.mock.calls.length, p: mockPreview.mock.calls.length, e: mockExplain.mock.calls.length };
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    await screen.findByTestId("builder-ai-repair-apply-success");
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith("wf-1", { operations: APPLY_OPS, baseRevision: "rev-1" });
    // No model/preview/suggest/explain re-issued by Apply.
    expect(mockDiagnose.mock.calls.length).toBe(before.d);
    expect(mockRepair.mock.calls.length).toBe(before.r);
    expect(mockPreview.mock.calls.length).toBe(before.p);
    expect(mockExplain.mock.calls.length).toBe(before.e);
  });

  it("success shows the success message and refetches/hydrates the draft", async () => {
    const user = await preview();
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const ok = await screen.findByTestId("builder-ai-repair-apply-success");
    expect(ok.textContent).toContain("Applied fix. Workflow not run.");
    await waitFor(() => expect(mockGetWorkflow).toHaveBeenCalledWith("wf-1"));
    // Button gone after success.
    expect(screen.queryByTestId("builder-ai-repair-apply-button")).toBeNull();
  });
});

describe("Apply — failure handling (no client graph mutation)", () => {
  it("stale → 'out of date / run Check again', no refetch, no graph change", async () => {
    const user = await preview();
    mockApply.mockResolvedValueOnce({ ok: false, applied: false, code: "STALE_PATCH", message: "x" });
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const err = await screen.findByTestId("builder-ai-repair-apply-error");
    expect(err.textContent).toMatch(/out of date/i);
    expect(err.textContent).toMatch(/run check workflow again/i);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    const gs = useGraphSlice.getState();
    expect(gs.pendingNodes.length).toBe(0);
    expect(gs.pendingEdges.length).toBe(0);
  });

  it("blocked → safe message, no refetch", async () => {
    const user = await preview();
    mockApply.mockResolvedValueOnce({ ok: false, applied: false, code: "NOT_APPLYABLE", message: "x", blockedCategories: ["SECRET_WRITE"] });
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const err = await screen.findByTestId("builder-ai-repair-apply-error");
    expect(err.textContent).toMatch(/can't be applied|run check/i);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("network throw → retry-safe message, no refetch", async () => {
    const user = await preview();
    mockApply.mockRejectedValueOnce(new Error("network down"));
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const err = await screen.findByTestId("builder-ai-repair-apply-error");
    expect(err.textContent).toMatch(/try again/i);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});

describe("Apply — pending guard + no-leak", () => {
  it("is disabled while applying and does not double-submit", async () => {
    const user = await preview();
    let resolveApply: (v: unknown) => void = () => {};
    mockApply.mockReturnValue(new Promise((res) => { resolveApply = res; }));
    await user.click(screen.getByTestId("builder-ai-repair-apply-button"));
    const btn = screen.getByTestId("builder-ai-repair-apply-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Applying…");
    await user.click(btn); // disabled → no-op
    expect(mockApply).toHaveBeenCalledTimes(1);
    resolveApply({ ok: true, applied: true, currentRevision: "rev-2", appliedOperations: [] });
    await waitFor(() => expect(screen.queryByTestId("builder-ai-repair-apply-success")).not.toBeNull());
  });

  it("never renders the raw operations / their values", async () => {
    await preview();
    const body = (await screen.findByTestId("builder-ai-repair-preview")).textContent ?? "";
    expect(body).not.toContain("OPAQUE_REF");
    expect(body).not.toContain("fieldPath");
    expect(body).not.toContain("baseRevision");
  });
});
