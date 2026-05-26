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

  it("shows a format-error message + value-free detail on PARSE_FAILED (no raw parser message)", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: false,
      code: "PARSE_FAILED",
      message: "unparseable",
      errors: [
        { stage: "parse", code: "INVALID_PATCH", message: "proposedPatch failed schema validation: ..." },
      ],
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    const failure = await screen.findByTestId("builder-ai-plan-failure");
    expect(failure).toHaveTextContent(/wrong format/i);
    expect(screen.getByTestId("builder-ai-plan-failure-detail")).toHaveTextContent("parse / INVALID_PATCH");
    // The raw (model-derived) parser message must never be rendered.
    expect(document.body.textContent).not.toContain("proposedPatch failed schema validation");
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });

  it("shows a JSON-specific message + value-free detail on PARSE_FAILED / NOT_JSON (AI-12C)", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: false,
      code: "PARSE_FAILED",
      message: "unparseable",
      errors: [{ stage: "parse", code: "NOT_JSON", message: "The model response was not valid JSON." }],
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    const failure = await screen.findByTestId("builder-ai-plan-failure");
    expect(failure).toHaveTextContent(/text instead of the required JSON/i);
    expect(screen.getByTestId("builder-ai-plan-failure-detail")).toHaveTextContent("parse / NOT_JSON");
    expect(document.body.textContent).not.toContain("The model response was not valid JSON.");
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

// ─── Slice 4.AI-20 — apply-readiness gate for unresolved required input ──────
describe("apply-readiness gate (AI-20)", () => {
  it("hides the Apply button + renders the required-input block when the AI returns a patch alongside non-empty requiredUserInput", async () => {
    // Live regression case: the AI returned a structurally-valid patch
    // AND a requiredUserInput list. Pre-AI-20 the UI surfaced Apply
    // (because preview.canApplyLater was true). AI-20 gates the panel on
    // requiredUserInput being empty.
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      requiredUserInput: [
        { label: "Which Slack channel should the message be sent to?", kind: "config_value" },
        { label: "What should the message say?", kind: "config_value" },
      ],
      canApplyLater: false, // service contract — AI-20 service gate
      blockedReason: "More information is still needed — answer the questions above and run Plan with AI again.",
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    // Required-input list still renders (existing UX) so the user sees
    // what's missing.
    expect(await screen.findByTestId("builder-ai-needs-input")).toBeInTheDocument();
    // The AI-20 callout tells the user how to proceed (AI-21 reworded it to
    // route the user through the follow-up composer affordance: "Reply with
    // the missing details below and hit Send details").
    expect(screen.getByTestId("builder-ai-required-input-block")).toHaveTextContent(
      /Reply with the missing details below.*Send details/i,
    );
    // Apply controls hidden.
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-risk-ack-checkbox")).not.toBeInTheDocument();
  });

  it("apply() is never called when a plan has unresolved requiredUserInput (defense in depth)", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      requiredUserInput: [{ label: "Which channel?", kind: "config_value" }],
      canApplyLater: false,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    await screen.findByTestId("builder-ai-required-input-block");
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("hides the Apply button even if canApplyLater is (incorrectly) true while requiredUserInput is non-empty (UI defense in depth against contract drift)", async () => {
    // Belt-and-suspenders: even if a future service-layer regression
    // re-leaks canApplyLater:true alongside non-empty requiredUserInput,
    // the UI must still refuse Apply. The live-smoke bug was exactly
    // this combination — keep both gates in place.
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      requiredUserInput: [{ label: "Which channel?", kind: "config_value" }],
      canApplyLater: true, // deliberately wrong — UI must NOT trust it.
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    await screen.findByTestId("builder-ai-required-input-block");
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });

  it("still renders the Apply button when requiredUserInput is empty AND canApplyLater is true (happy path preserved)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(await screen.findByTestId("builder-ai-apply-button")).toBeEnabled();
    expect(
      screen.queryByTestId("builder-ai-required-input-block"),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the AI-20 callout when the patch is preview-rejected for non-required-input reasons (existing not-applyable copy still renders)", async () => {
    // The pre-AI-20 "This plan can't be applied as-is" copy is preserved
    // for preview-rejected patches (no requiredUserInput).
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      canApplyLater: false,
      blockedReason: "Preview rejected the proposed plan.",
      requiredUserInput: [],
    });
    render(<BuilderAiPanel />);
    await typeAndPlan();
    expect(
      await screen.findByTestId("builder-ai-not-applyable"),
    ).toHaveTextContent(/can.+t be applied as-is/i);
    expect(
      screen.queryByTestId("builder-ai-required-input-block"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });
});

// ─── Slice 4.AI-21 — session-local follow-up composer ───────────────────────
describe("follow-up composer (AI-21)", () => {
  const needsInputPlan = {
    ...planApplyReady,
    requiredUserInput: [
      { label: "Which Slack channel should the message be sent to?", kind: "config_value" },
      { label: "What should the message say?", kind: "config_value" },
    ],
    canApplyLater: false,
    blockedReason: "More information is still needed — answer the questions above and run Plan with AI again.",
  };

  const stillNeedsMessage = {
    ...needsInputPlan,
    requiredUserInput: [
      { label: "What should the message say?", kind: "config_value" },
    ],
  };

  it("switches the composer button copy + hint to follow-up mode when required input is unresolved", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan);
    render(<BuilderAiPanel />);
    await typeAndPlan("Create a workflow that sends a Slack message when I manually run it.");
    await screen.findByTestId("builder-ai-required-input-block");
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Send details");
    // The hotkey hint flips from "plan" → "send".
    expect(screen.getByTestId("builder-ai-panel")).toHaveTextContent("send");
  });

  it("submitting in follow-up mode sends a reconstructed prompt to planWorkflow (original + asked labels + user answer)", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan);
    mockPlan.mockResolvedValueOnce(planApplyReady); // chain completes
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a workflow that sends a Slack message when I manually run it.");
    await screen.findByTestId("builder-ai-required-input-block");
    // Replace the prompt with the follow-up answer and submit.
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.clear(textarea);
    await user.type(textarea, "Use #general and say Test from ChainReact AI.");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const [, secondBody] = mockPlan.mock.calls[1]!;
    const reconstructed = (secondBody as { prompt: string }).prompt;
    expect(reconstructed).toContain("Original request:");
    expect(reconstructed).toContain("Create a workflow that sends a Slack message when I manually run it.");
    expect(reconstructed).toContain("The agent asked for:");
    expect(reconstructed).toContain("- Which Slack channel should the message be sent to?");
    expect(reconstructed).toContain("- What should the message say?");
    expect(reconstructed).toContain("User follow-up:");
    expect(reconstructed).toContain("Use #general and say Test from ChainReact AI.");
  });

  it("Apply remains hidden during the follow-up chain and only appears after the chain completes", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan); // turn 1 — chain starts
    mockPlan.mockResolvedValueOnce(planApplyReady); // turn 2 — chain completes
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-required-input-block")).toBeInTheDocument();
    // Submit the follow-up.
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.clear(textarea);
    await user.type(textarea, "Use #general and say hi");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    // After the chain completes, Apply reappears + the callout is gone.
    expect(await screen.findByTestId("builder-ai-apply-button")).toBeEnabled();
    expect(
      screen.queryByTestId("builder-ai-required-input-block"),
    ).not.toBeInTheDocument();
    // Button copy returns to "Plan with AI" now that the chain is complete.
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Plan with AI");
  });

  it("supports multi-turn chains — composer stays in follow-up mode when one question is still unresolved", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan); // turn 1 — 2 questions
    mockPlan.mockResolvedValueOnce(stillNeedsMessage); // turn 2 — 1 question remains
    mockPlan.mockResolvedValueOnce(planApplyReady); // turn 3 — complete
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    const textarea = screen.getByTestId("builder-ai-prompt");

    // Turn 2 — answer one question, chain still active.
    await user.clear(textarea);
    await user.type(textarea, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId("builder-ai-required-input-block")).toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Send details");

    // Turn 3 — answer remaining question, chain completes.
    await user.clear(textarea);
    await user.type(textarea, "Say hi");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(3));

    // Turn 3's reconstructed prompt cites turn 2's answer in the "Previous follow-up answers" section.
    const [, thirdBody] = mockPlan.mock.calls[2]!;
    const thirdPrompt = (thirdBody as { prompt: string }).prompt;
    expect(thirdPrompt).toContain("Previous follow-up answers:");
    expect(thirdPrompt).toContain("- Use #general");
    expect(thirdPrompt).toContain("User follow-up:");
    expect(thirdPrompt).toContain("Say hi");
  });

  it("Clear resets the follow-up chain — next submit acts as a fresh plan, not a follow-up", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan);
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    await screen.findByTestId("builder-ai-required-input-block");
    // Clear resets state — the next submit is a fresh plan with the
    // current textarea text (retained per the AI-11B contract).
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    expect(screen.queryByTestId("builder-ai-required-input-block")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Plan with AI");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const [, secondBody] = mockPlan.mock.calls[1]!;
    // Fresh plan — not a reconstructed follow-up prompt.
    expect((secondBody as { prompt: string }).prompt).not.toContain("Original request:");
  });

  it("Plan-another-change after a successful apply resets the follow-up chain", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan);
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({
      ok: true,
      appliedPatchId: "p1",
      summaryText: "Applied.",
      updatedAt: "t",
      workflowId: "wf-1",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
    });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.clear(textarea);
    await user.type(textarea, "Use #general and say hi");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-apply-button");
    await user.click(screen.getByTestId("builder-ai-apply-button"));
    await screen.findByTestId("builder-ai-apply-success");
    // Plan another change resets state.
    await user.click(screen.getByTestId("builder-ai-plan-another-button"));
    expect(screen.queryByTestId("builder-ai-apply-success")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-plan-result")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Plan with AI");
  });

  it("does NOT include raw patch / config / secrets in the reconstructed follow-up prompt", async () => {
    // The planner response carries a patch with a secret-shaped config value.
    // The hook (AI-21) only reads labels + the user's text — never the patch
    // contents. Defense-in-depth no-leak test for the prompt-reconstruction
    // seam.
    mockPlan.mockResolvedValueOnce({
      ...needsInputPlan,
      proposedPatch: {
        patchId: "p1",
        operations: [
          { op: "addNode", node: { id: "n1", config: { accessToken: "ya29.LEAKED-SECRET" } } },
        ],
        summary: "needs info",
      },
    });
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    await screen.findByTestId("builder-ai-required-input-block");
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.clear(textarea);
    await user.type(textarea, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const [, secondBody] = mockPlan.mock.calls[1]!;
    const reconstructed = (secondBody as { prompt: string }).prompt;
    expect(reconstructed).not.toContain("accessToken");
    expect(reconstructed).not.toContain("ya29.LEAKED-SECRET");
    expect(reconstructed).not.toContain("patchId");
    expect(reconstructed).not.toContain("operations");
  });

  it("preserves the chain when the follow-up plan call returns an unhandled transport error (user can retry without re-typing the original prompt)", async () => {
    mockPlan.mockResolvedValueOnce(needsInputPlan); // turn 1 — starts chain
    mockPlan.mockRejectedValueOnce(new Error("network gone")); // turn 2 — fails
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.clear(textarea);
    await user.type(textarea, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // Even after transport failure, the chain is still active so the user
    // can retry — composer stays in follow-up mode.
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent(
      "Send details",
    );
    expect(screen.getByTestId("builder-ai-error")).toBeInTheDocument();
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
