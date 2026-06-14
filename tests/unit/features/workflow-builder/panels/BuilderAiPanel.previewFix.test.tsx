/**
 * Tests for the "Preview fix" validated-patch-preview UI in BuilderAiPanel
 * (Slice 4.AI-REPAIR-2c).
 *
 * RTL component tests with `@/lib/api/ai` mocked (no fetch/network). They pin: the
 * Preview-fix affordance appears ONLY on the latest repair_proposal bubble (never on
 * the diagnosis card, never before a proposal exists), an explicit click calls
 * `previewWorkflowRepair(workflowId, currentDraft, proposalContext)` once, the preview
 * bubble renders label-based changes + the validated risk + the immutable UI-owned
 * "preview only" notice (no raw node ids / raw JSON), a blocked preview renders the
 * friendly blocked reason + errors, a success disables the button (no repeat charge),
 * credit/model failures render safe copy, and NO graph mutation / save / run / apply
 * is triggered.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDiagnose = jest.fn();
const mockRepair = jest.fn();
const mockPreview = jest.fn();
const mockExplain = jest.fn();
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

import { AI_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/api/ai";
import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const issueDiagnosis = {
  workflowId: "wf-1",
  access: "OK",
  overallReady: false,
  summaryText: "This workflow can't run yet because the Gmail step is missing its recipient.",
  nextSteps: ["Set the recipient on the Gmail step."],
  findings: [{ source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", provider: "gmail" }],
};

const proposalOk = {
  ok: true,
  proposal: {
    summary: "Set the recipient on the Gmail step.",
    recommendedActions: ["Set the To field on the Gmail step"],
    affectedNodes: ["Gmail — Send Email"],
    missingInfo: [],
    riskLevel: "low",
    canAutoPatchLater: true,
    requiresUserAction: false,
    notAppliedNotice: "server suggestion notice",
  },
};

const previewOk = {
  ok: true,
  preview: {
    ok: true,
    patchSummary: "Set the recipient on the Gmail step.",
    changes: [
      { op: "updateNodeConfig", description: 'Updates configuration for "Gmail — Send Email" (fields: to).', nodeId: "node-INTERNAL-A", fields: ["to"] },
    ],
    affectedNodeIds: ["node-INTERNAL-A"],
    affectedEdgeIds: [],
    riskLevel: "high",
    requiresConfirmation: true,
    riskReasons: [],
    validation: { ok: true, errors: [], warnings: [{ code: "COST_WARNING", message: "This will increase task usage." }] },
    taskCostEstimate: { estimatedTasksPerRun: 2 },
    userFacingSummaryText: "Set the recipient — 1 change(s). Risk: high (confirmation required).",
    candidateSummary: "2 node(s), 1 edge(s) · trigger: Gmail — New Email · 1 action(s)",
    canApplyLater: true,
  },
  notAppliedNotice: "server-supplied preview notice that must NOT be trusted",
};

const previewBlocked = {
  ok: true,
  preview: {
    ok: false,
    patchSummary: "Repair the recipient.",
    changes: [],
    affectedNodeIds: ["node-GONE-B"],
    affectedEdgeIds: [],
    riskLevel: "low",
    requiresConfirmation: false,
    riskReasons: [],
    validation: {
      ok: false,
      errors: [{ code: "UNKNOWN_NODE", message: "This references a step that’s no longer in the workflow." }],
      warnings: [],
    },
    userFacingSummaryText: "BLOCKED — 1 error(s).",
    canApplyLater: false,
    blockedReason: "This references a step that’s no longer in the workflow.",
  },
  notAppliedNotice: "x",
};

beforeEach(() => {
  mockDiagnose.mockReset();
  mockDiagnose.mockResolvedValue(issueDiagnosis);
  mockRepair.mockReset();
  mockRepair.mockResolvedValue(proposalOk);
  mockPreview.mockReset();
  mockPreview.mockResolvedValue(previewOk);
  mockExplain.mockReset();
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  mockGetWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

/** Check → return the user (issue diagnosis with a real finding). */
async function check() {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.click(screen.getByTestId("builder-ai-check-button"));
  await screen.findByTestId("builder-ai-diagnosis");
  return user;
}

/** Check → Suggest a fix → return the user (a repair proposal now exists). */
async function suggest() {
  const user = await check();
  await user.click(screen.getByTestId("builder-ai-suggest-fix-button"));
  await screen.findByTestId("builder-ai-repair-proposal");
  return user;
}

describe("Preview fix — affordance visibility", () => {
  it("does NOT appear on the diagnosis bubble or before a repair proposal exists", async () => {
    await check();
    // Diagnosis card is up; Suggest exists, but Preview does not.
    expect(screen.getByTestId("builder-ai-suggest-fix-button")).toBeEnabled();
    expect(screen.queryByTestId("builder-ai-preview-fix-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-repair-preview-fix")).toBeNull();
  });

  it("appears on the repair_proposal bubble after a successful proposal", async () => {
    await suggest();
    const btn = screen.getByTestId("builder-ai-preview-fix-button");
    expect(btn).toBeEnabled();
    expect(btn.textContent).toContain("Preview fix");
    // Lives inside the proposal bubble, not the diagnosis card.
    expect(screen.getByTestId("builder-ai-repair-proposal")).toContainElement(btn);
    expect(mockPreview).not.toHaveBeenCalled(); // not auto-called
  });
});

describe("Preview fix — happy path", () => {
  it("explicit click calls previewWorkflowRepair(workflowId, currentDraft, proposalContext) once", async () => {
    const user = await suggest();
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({ nodes: [], edges: [] }),
      expect.objectContaining({
        summary: "Set the recipient on the Gmail step.",
        recommendedActions: ["Set the To field on the Gmail step"],
      }),
    );
  });

  it("renders the preview: label-based changes, validated risk, candidate/cost, immutable notice", async () => {
    const user = await suggest();
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");

    const changes = screen.getByTestId("builder-ai-repair-preview-changes");
    expect(changes.textContent).toContain('Updates configuration for "Gmail — Send Email"');

    const risk = screen.getByTestId("builder-ai-repair-preview-risk");
    expect(risk.textContent).toMatch(/validated risk/i);
    expect(risk.textContent).toContain("high");
    expect(risk.textContent).toContain("2 task(s)/run");

    expect(screen.getByTestId("builder-ai-repair-preview-candidate").textContent).toContain("After:");
    expect(screen.getByTestId("builder-ai-repair-preview-warnings").textContent).toContain("increase task usage");

    // Immutable UI-owned notice — NOT the server-supplied notAppliedNotice.
    const notice = screen.getByTestId("builder-ai-repair-preview-not-applied");
    expect(notice.textContent).toContain("preview only");
    expect(notice.textContent).toContain("wasn't changed, saved, or run");
    expect(notice.textContent).not.toContain("must NOT be trusted");
  });

  it("renders a pending 'Previewing fix…' indicator while in flight", async () => {
    const user = await suggest();
    let resolvePreview: (v: unknown) => void = () => {};
    mockPreview.mockReturnValue(new Promise((res) => { resolvePreview = res; }));
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    await screen.findByTestId("builder-ai-previewing");
    const btn = screen.getByTestId("builder-ai-preview-fix-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Previewing fix…");
    resolvePreview(previewOk);
    await waitFor(() => expect(screen.queryByTestId("builder-ai-previewing")).toBeNull());
  });

  it("after a successful preview the button is disabled + 'Previewed'; a repeat click does not re-call", async () => {
    const user = await suggest();
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    const btn = screen.getByTestId("builder-ai-preview-fix-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Previewed");
    await user.click(btn); // disabled → no-op
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("renders NO Apply control and triggers NO save / graph hydrate / run", async () => {
    const user = await suggest();
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    await screen.findByTestId("builder-ai-repair-preview");
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    expect(screen.queryByTestId("builder-ai-apply-success")).toBeNull();
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    // Graph store untouched — still the empty hydrated draft, same workflow.
    const gs = useGraphSlice.getState();
    expect(gs.workflowId).toBe("wf-1");
    expect(gs.pendingNodes.length).toBe(0);
    expect(gs.pendingEdges.length).toBe(0);
  });
});

describe("Preview fix — blocked + failures render safe copy", () => {
  it("a validation-blocked preview renders the friendly blocked reason + errors (no Apply)", async () => {
    const user = await suggest();
    mockPreview.mockResolvedValueOnce(previewBlocked);
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    const blocked = await screen.findByTestId("builder-ai-repair-preview-blocked");
    expect(blocked.textContent).toContain("can’t be applied as-is");
    expect(blocked.textContent).toContain("no longer in the workflow");
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    // A blocked preview is still a preview message (not an error bubble).
    expect(screen.getByTestId("builder-ai-repair-preview")).not.toBeNull();
  });

  it("AI_CREDITS_EXHAUSTED renders the shared safe credit message (button stays retryable)", async () => {
    const user = await suggest();
    mockPreview.mockResolvedValueOnce({ ok: false, code: "AI_CREDITS_EXHAUSTED", message: "ignored" });
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toBe(AI_CREDITS_EXHAUSTED_MESSAGE);
    expect(screen.getByTestId("builder-ai-preview-fix-button")).toBeEnabled();
  });

  it("model/gate failure renders safe generic copy, no internals", async () => {
    const user = await suggest();
    mockPreview.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "boom: SECRET-INTERNAL" });
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("Couldn’t build a repair preview");
    expect(err.textContent).not.toContain("SECRET-INTERNAL");
    expect(err.textContent).not.toContain("MODEL_FAILED");
  });

  it("a 401 transport throw renders a sign-in prompt", async () => {
    const user = await suggest();
    const { AiApiError } = await import("@/lib/api/ai");
    mockPreview.mockRejectedValueOnce(new AiApiError("unauthenticated", 401));
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    const err = await screen.findByTestId("builder-ai-error-message");
    expect(err.textContent).toContain("sign in");
  });
});

describe("Preview fix — no-leak", () => {
  it("the preview bubble renders no raw node ids and no raw JSON", async () => {
    const user = await suggest();
    await user.click(screen.getByTestId("builder-ai-preview-fix-button"));
    const body = await screen.findByTestId("builder-ai-repair-preview");
    const t = body.textContent ?? "";
    // No internal node ids in user-facing copy.
    for (const needle of ["node-INTERNAL-A", "node-GONE-B", "wf-1", "gpt-", "inputTokens"]) {
      expect(t).not.toContain(needle);
    }
    // No raw JSON / raw field-key dump as the primary UI.
    for (const needle of ["affectedNodeIds", "riskReasons", "patchId", '"op":', '{"']) {
      expect(t).not.toContain(needle);
    }
  });
});
