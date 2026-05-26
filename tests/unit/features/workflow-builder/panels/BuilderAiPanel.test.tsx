/**
 * Tests for features/workflow-builder/panels/BuilderAiPanel (Slice 4.AI-11,
 * UX-hardened in 4.AI-11B).
 *
 * RTL component tests with the AI + workflows API clients mocked (no fetch, no
 * network). These pin the plan → preview → confirm → apply flow, the per-state
 * user-facing copy, the planning indicator, the character counter, confirmation
 * reset on a new plan, stale-patch recovery (re-run, never auto-reapply), clear,
 * no-auto-apply, and the no-leak guarantee (raw patch config is never rendered).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPlan = jest.fn();
const mockApply = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  // Real-ish error class so the hook's `instanceof AiApiError` works.
  AiApiError: class AiApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AiApiError";
      this.status = status;
    }
  },
}));

const mockGetWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => ({
  getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
}));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const planApplyReady = {
  ok: true,
  intentSummary: "Add a Slack post after the email trigger",
  assumptions: [],
  requiredUserInput: [],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p1", operations: [], summary: "s" },
  preview: {
    ok: true,
    riskLevel: "low",
    requiresConfirmation: false,
    affectedNodeIds: ["n1"],
    affectedEdgeIds: [],
    changes: [{ op: "addNode", description: 'Adds "Send channel message".' }],
    validation: { ok: true, errors: [], warnings: [] },
    taskCostEstimate: { estimatedTasksPerRun: 1 },
  },
  canApplyLater: true,
  model: { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" },
};

const planHighRisk = {
  ...planApplyReady,
  preview: { ...planApplyReady.preview, riskLevel: "high", requiresConfirmation: true },
};

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockGetWorkflow.mockReset();
  mockGetWorkflow.mockResolvedValue({ id: "wf-1", draftDefinition: { nodes: [], edges: [] } });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

async function typeAndPlan(prompt = "Post to Slack on new email") {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("builder-ai-prompt"), prompt);
  await user.click(screen.getByTestId("builder-ai-plan-button"));
  return user;
}

describe("rendering + submit", () => {
  it("renders the prompt box and a disabled plan button when empty", () => {
    render(<BuilderAiPanel />);
    expect(screen.getByTestId("builder-ai-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toBeDisabled();
  });

  it("renders nothing when there is no workflow id", () => {
    useGraphSlice.getState().reset();
    const { container } = render(<BuilderAiPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("submits the trimmed prompt to planWorkflow with the workflow id", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan("build it");
    await waitFor(() => expect(mockPlan).toHaveBeenCalledWith("wf-1", { prompt: "build it" }));
  });
});

describe("plan states", () => {
  it("shows a friendly message when the model is not configured (MODEL_FAILED)", async () => {
    mockPlan.mockResolvedValueOnce({ ok: false, code: "MODEL_FAILED", message: "x", errors: [] });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-plan-failure")).toHaveTextContent(/isn’t available|not available/i);
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });

  it("shows needs-input and no apply button when the plan needs more info", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: null,
      canApplyLater: false,
      requiredUserInput: [{ label: "Pick a Slack channel", kind: "config_value" }],
      preview: undefined,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-needs-input")).toHaveTextContent("Pick a Slack channel");
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });

  it("shows unsupported requests safely", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: null,
      canApplyLater: false,
      unsupportedRequests: ["send a fax"],
      preview: undefined,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-unsupported")).toHaveTextContent("send a fax");
  });

  it("shows validation errors and no apply button when the preview is not apply-ready", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      canApplyLater: false,
      blockedReason: "UNKNOWN_ACTION: Unknown action.",
      preview: {
        ...planApplyReady.preview,
        ok: false,
        validation: { ok: false, errors: [{ code: "UNKNOWN_ACTION", message: "Unknown action 'fake'." }], warnings: [] },
      },
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-validation-errors")).toHaveTextContent("Unknown action 'fake'.");
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });

  it("shows an apply button when canApplyLater is true (low risk)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-apply-button")).toBeEnabled();
  });
});

describe("confirmation + apply", () => {
  it("does NOT auto-apply after a successful plan", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan();
    await screen.findByTestId("builder-ai-apply-button");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("applies a low-risk plan without confirmation and forwards the patch", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: true, appliedPatchId: "p1", summaryText: "Applied 1 change.", updatedAt: "t", workflowId: "wf-1", appliedOperationCount: 1, riskLevel: "low", requiresConfirmation: false });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    await waitFor(() =>
      expect(mockApply).toHaveBeenCalledWith("wf-1", { patch: { patchId: "p1", operations: [], summary: "s" } }),
    );
  });

  it("requires explicit confirmation before applying a high-risk plan", async () => {
    mockPlan.mockResolvedValueOnce(planHighRisk);
    render(<BuilderAiPanel />);
    await typeAndPlan();
    const applyBtn = await screen.findByTestId("builder-ai-apply-button");
    expect(applyBtn).toBeDisabled(); // gated behind the risk acknowledgement
  });

  it("applies a high-risk plan with confirmation after the user acknowledges the risk", async () => {
    mockPlan.mockResolvedValueOnce(planHighRisk);
    mockApply.mockResolvedValueOnce({ ok: true, appliedPatchId: "p1", summaryText: "Applied.", updatedAt: "t", workflowId: "wf-1", appliedOperationCount: 1, riskLevel: "high", requiresConfirmation: true });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-risk-ack-checkbox"));
    await user.click(screen.getByTestId("builder-ai-apply-button"));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    const [, body] = mockApply.mock.calls[0]!;
    expect(body.confirmation.confirmed).toBe(true);
    expect(body.confirmation.acceptedRiskLevel).toBe("high");
  });

  it("refreshes the builder and shows success after a successful apply", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: true, appliedPatchId: "p1", summaryText: "Applied 1 change to \"WF\".", updatedAt: "t", workflowId: "wf-1", appliedOperationCount: 1, riskLevel: "low", requiresConfirmation: false });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    expect(await screen.findByTestId("builder-ai-apply-success")).toHaveTextContent("Applied 1 change");
    await waitFor(() => expect(mockGetWorkflow).toHaveBeenCalledWith("wf-1"));
  });

  it("shows a re-run message and a Re-run plan button on STALE_PATCH (no auto-reapply)", async () => {
    mockPlan.mockResolvedValue(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: false, code: "STALE_PATCH", message: "stale" });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    expect(await screen.findByTestId("builder-ai-apply-failure")).toHaveTextContent(/workflow changed/i);
    const rerun = screen.getByTestId("builder-ai-rerun-button");
    expect(mockApply).toHaveBeenCalledTimes(1); // not auto-reapplied
    // Re-run re-plans (does not re-apply).
    await user.click(rerun);
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    expect(mockApply).toHaveBeenCalledTimes(1);
  });
});

describe("AI-11B UX hardening", () => {
  it("shows a planning indicator while the plan request is in flight", async () => {
    let resolvePlan: ((v: unknown) => void) | undefined;
    mockPlan.mockImplementationOnce(() => new Promise((res) => { resolvePlan = res; }));
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(screen.getByTestId("builder-ai-planning")).toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Thinking…");
    resolvePlan?.(planApplyReady);
    await screen.findByTestId("builder-ai-plan-result");
  });

  it("clears the result with the Clear button but keeps the prompt", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Post to Slack");
    await screen.findByTestId("builder-ai-plan-result");
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    expect(screen.queryByTestId("builder-ai-plan-result")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-prompt")).toHaveValue("Post to Slack");
  });

  it("shows a character counter near the limit and disables submit when too long", () => {
    render(<BuilderAiPanel />);
    const textarea = screen.getByTestId("builder-ai-prompt");
    fireEvent.change(textarea, { target: { value: "a".repeat(6500) } });
    expect(screen.getByTestId("builder-ai-char-count")).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: "a".repeat(8001) } });
    expect(screen.getByTestId("builder-ai-char-count")).toHaveTextContent(/too long/i);
    expect(screen.getByTestId("builder-ai-plan-button")).toBeDisabled();
  });

  it("resets the risk acknowledgement when a new plan is requested", async () => {
    mockPlan.mockResolvedValue(planHighRisk);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-risk-ack-checkbox"));
    expect(screen.getByTestId("builder-ai-apply-button")).toBeEnabled();
    // New plan resets confirmation.
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("builder-ai-risk-ack-checkbox")).not.toBeChecked();
    expect(screen.getByTestId("builder-ai-apply-button")).toBeDisabled();
  });

  it("renders risk reasons and validation warnings readably", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      preview: {
        ...planApplyReady.preview,
        riskReasons: [{ code: "removes_user_work", message: "Removes existing nodes." }],
        validation: { ok: true, errors: [], warnings: [{ code: "COST_WARNING", message: "This may be costly." }] },
      },
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-risk-reasons")).toHaveTextContent("Removes existing nodes.");
    expect(screen.getByTestId("builder-ai-validation-warnings")).toHaveTextContent("This may be costly.");
  });

  it("offers a Plan-another-change button after a successful apply", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: true, appliedPatchId: "p1", summaryText: "Applied.", updatedAt: "t", workflowId: "wf-1", appliedOperationCount: 1, riskLevel: "low", requiresConfirmation: false });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    const another = await screen.findByTestId("builder-ai-plan-another-button");
    await user.click(another);
    expect(screen.queryByTestId("builder-ai-apply-success")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-plan-result")).not.toBeInTheDocument();
  });
});

describe("no-leak", () => {
  it("never renders raw patch config values", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: {
        patchId: "p1",
        operations: [
          { op: "addNode", node: { id: "n2", config: { accessToken: "ya29.LEAKED-SECRET" } } },
        ],
      },
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    await screen.findByTestId("builder-ai-apply-button");
    expect(document.body.textContent).not.toContain("ya29.LEAKED-SECRET");
    expect(document.body.textContent).not.toContain("accessToken");
  });
});
