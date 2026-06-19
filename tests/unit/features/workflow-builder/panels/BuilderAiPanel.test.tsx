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
// AI-23 — persistent Builder Agent thread helpers default to no-ops so the
// existing AI-11/AI-20/AI-21/AI-21B/AI-22 test scenarios continue to exercise
// session-local state. Individual AI-23 tests in the dedicated suite can
// override these mocks.
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
  appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
  clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
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
  // AI-23 — default thread mocks: empty history on load, no-op writes.
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "thr-1", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({
    id: "m-mock",
    role: "user",
    kind: "prompt",
    content: "",
    safePayload: {},
    createdAt: "now",
  });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
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
    // AI-24 — the panel now sends `currentGraph` (pending canvas snapshot)
    // alongside the prompt. The graph hydrates empty in beforeEach, so the
    // snapshot is `{ nodes: [], edges: [] }`. The prompt itself is still
    // trimmed verbatim — that's the original AI-11 invariant.
    await waitFor(() =>
      expect(mockPlan).toHaveBeenCalledWith("wf-1", {
        prompt: "build it",
        currentGraph: { nodes: [], edges: [] },
        // AI-35D — plan() tags the request as the user's first prompt.
        interactionKind: "initial_plan",
      }),
    );
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

  // Slice 4.BUILDER-APPLY-HYDRATE-RACE-1 — onApplied hydrates the builder graph
  // from the post-apply getWorkflow draft AND threads its revision so a later
  // stale prop hydrate is ignored.
  it("hydrates the graph from the post-apply draft + revision after a successful apply", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: true, appliedPatchId: "p1", summaryText: "Applied.", updatedAt: "2026-05-06T00:05:00Z", workflowId: "wf-1", appliedOperationCount: 1, riskLevel: "low", requiresConfirmation: false });
    mockGetWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      updatedAt: "2026-05-06T00:05:00Z",
      draftDefinition: {
        nodes: [{ id: "t", kind: "trigger", provider: "gmail", type: "new_email", config: {}, position: { x: 0, y: 0 } }],
        edges: [],
      },
    });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    await waitFor(() => expect(useGraphSlice.getState().pendingNodes).toHaveLength(1));
    expect(useGraphSlice.getState().savedNodes).toHaveLength(1);
    expect(useGraphSlice.getState().hydratedRevision).toBe("2026-05-06T00:05:00Z");
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

  it("clears the conversation (messages + composer text) with the Clear button (AI-21B: chat-style reset)", async () => {
    // AI-21B — Clear is now a "new conversation" affordance. It resets
    // the chat messages, the composer textarea, the hook chain state,
    // and the risk-ack. (The AI-11B "keep the prompt after Clear"
    // contract is intentionally retired — the composer auto-clears after
    // every send per standard chat UX, so retaining text on Clear would
    // surprise the user.)
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Post to Slack");
    await screen.findByTestId("builder-ai-plan-result");
    // Sanity: the chat-pattern auto-clear already emptied the textarea
    // when the user message was appended.
    expect(screen.getByTestId("builder-ai-prompt")).toHaveValue("");
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    expect(screen.queryByTestId("builder-ai-plan-result")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-message-user")).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-message-assistant")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-prompt")).toHaveValue("");
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
    // AI-21B — composer auto-clears after submit, so triggering a second
    // plan turn requires re-typing (same as any normal chat). The
    // behavior being pinned is unchanged: every new plan starts with the
    // risk-ack unchecked and the Apply button disabled.
    mockPlan.mockResolvedValue(planHighRisk);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan();
    await user.click(await screen.findByTestId("builder-ai-risk-ack-checkbox"));
    expect(screen.getByTestId("builder-ai-apply-button")).toBeEnabled();
    // Type a new prompt (composer empty after previous send) and submit.
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "tweak the slack post copy");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // The newest plan_result message owns the risk-ack checkbox — older
    // plan_results collapse to summary in the AI-21B chat layout.
    expect(screen.getByTestId("builder-ai-risk-ack-checkbox")).not.toBeChecked();
    expect(screen.getByTestId("builder-ai-apply-button")).toBeDisabled();
  });

  it("labels the chat-rendered preview as 'Preview only · not applied yet' with an explicit 'click Apply change' disclaimer (AI-22 follow-up)", async () => {
    // Live testing after AI-22 surfaced a user-perception risk: the
    // chat-rendered PreviewSection (counts + risk + change descriptions)
    // can resemble the canvas at a glance. The disclaimer below the
    // header makes the read-only nature unambiguous.
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan();
    const header = await screen.findByTestId("builder-ai-preview-header");
    expect(header).toHaveTextContent(/Preview only/i);
    expect(header).toHaveTextContent(/not applied yet/i);
    const disclaimer = screen.getByTestId("builder-ai-preview-disclaimer");
    expect(disclaimer).toHaveTextContent(/Nothing is saved to your workflow/i);
    expect(disclaimer).toHaveTextContent(/Apply change/);
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
      blockedReason: "More information is still needed — answer the questions above and send again.",
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
    // Button copy returns to the default "Send" now that the chain is complete.
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Send");
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
    // AI-21B — Clear is a full reset (messages + composer + hook state).
    // After Clear the user must type a brand-new prompt; submitting it
    // must produce a fresh, NOT-reconstructed planner prompt.
    mockPlan.mockResolvedValueOnce(needsInputPlan);
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    await screen.findByTestId("builder-ai-required-input-block");
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    expect(screen.queryByTestId("builder-ai-required-input-block")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Send");
    // Composer is empty after Clear — typing a fresh prompt is required.
    const textarea = screen.getByTestId("builder-ai-prompt");
    expect(textarea).toHaveValue("");
    // AUTOROUTE CS-3 — a fresh prompt is intent-routed; use a clearly plan-shaped
    // request so it reaches the planner (the point here is Clear resets the chain, so
    // the prompt is sent verbatim, NOT reconstructed).
    await user.type(textarea, "Create a different workflow");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const [, secondBody] = mockPlan.mock.calls[1]!;
    expect((secondBody as { prompt: string }).prompt).toBe("Create a different workflow");
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
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Send");
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

// ─── Slice 4.AI-22 — interactive required-input controls + structured follow-up
describe("required-input controls + structured follow-up (AI-22)", () => {
  // The planner-enriched needs-input response a real Slack-flavored
  // plan would produce: a patch with a Slack action + two
  // requiredUserInput entries, the channel one carrying the
  // optionsSource hint, the text one carrying the textarea hint.
  const enrichedNeedsInput = {
    ...planApplyReady,
    requiredUserInput: [
      {
        label: "Which Slack channel should the message be sent to?",
        nodeId: "n_slack",
        field: "channel",
        kind: "config_value",
        provider: "slack",
        nodeType: "send_channel_message",
        nodeLabel: "Send Channel Message",
        fieldLabel: "Channel",
        fieldType: "combobox",
        optionsSource: "slack:channels",
        allowFreeText: true,
      },
      {
        label: "What should the message say?",
        nodeId: "n_slack",
        field: "text",
        kind: "config_value",
        provider: "slack",
        nodeType: "send_channel_message",
        nodeLabel: "Send Channel Message",
        fieldLabel: "Message",
        fieldType: "textarea",
        allowFreeText: true,
      },
    ],
    canApplyLater: false,
  };

  it("renders an interactive control per required-input entry (combobox for channel, textarea for message)", async () => {
    mockPlan.mockResolvedValueOnce(enrichedNeedsInput);
    render(<BuilderAiPanel />);
    await typeAndPlan("Create a Slack workflow");
    const controls = await screen.findAllByTestId("builder-ai-required-input-control");
    expect(controls).toHaveLength(2);
    // One is the combobox (optionsSource branch), one is the textarea (the
    // `textarea` message field — AI-35E renders the matching multi-line editor).
    const variants = controls.map((c) => c.getAttribute("data-variant")).sort();
    expect(variants).toEqual(["options-source", "textarea"]);
  });

  it("typing in the channel combobox + message textarea stages structured answers without submitting", async () => {
    mockPlan.mockResolvedValueOnce(enrichedNeedsInput);
    render(<BuilderAiPanel />);
    await typeAndPlan("Create a Slack workflow");
    await screen.findAllByTestId("builder-ai-required-input-control");
    const textInput = screen.getByTestId("builder-ai-required-input-textarea") as HTMLTextAreaElement;
    fireEvent.change(textInput, { target: { value: "Test from ChainReact AI" } });
    // Only the initial plan call so far — staging answers does NOT auto-submit.
    expect(mockPlan).toHaveBeenCalledTimes(1);
  });

  it("submitting after staging structured answers sends a reconstructed prompt with 'User provided:' and Apply re-renders after chain completes", async () => {
    mockPlan.mockResolvedValueOnce(enrichedNeedsInput); // turn 1
    mockPlan.mockResolvedValueOnce(planApplyReady); // turn 2 — chain completes
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    await screen.findAllByTestId("builder-ai-required-input-control");
    // Stage a free-text answer for the Message field (the textarea control).
    const textInput = screen.getByTestId("builder-ai-required-input-textarea") as HTMLTextAreaElement;
    fireEvent.change(textInput, { target: { value: "Test from ChainReact AI" } });
    // Click submit (composer button) — no need to type into the composer; the
    // submission carries the staged answer alone.
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const [, secondBody] = mockPlan.mock.calls[1]!;
    const reconstructed = (secondBody as { prompt: string }).prompt;
    expect(reconstructed).toContain("User provided:");
    expect(reconstructed).toContain("Message: Test from ChainReact AI");
    expect(reconstructed).toContain("Original request:");
    // Chain completed → Apply renders.
    expect(await screen.findByTestId("builder-ai-apply-button")).toBeEnabled();
  });

  it("renders the user-message bubble with the staged answers (so the conversation transcript shows what was sent)", async () => {
    mockPlan.mockResolvedValueOnce(enrichedNeedsInput);
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    await screen.findAllByTestId("builder-ai-required-input-control");
    fireEvent.change(screen.getByTestId("builder-ai-required-input-textarea"), {
      target: { value: "Test from ChainReact AI" },
    });
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // After submit, the second user-message bubble carries the staged answers.
    const userBubbles = screen.getAllByTestId("builder-ai-message-user");
    expect(userBubbles).toHaveLength(2);
    expect(userBubbles[1]).toHaveTextContent(/Message:\s*Test from ChainReact AI/i);
  });

  it("Clear conversation resets staged answers (controls reset to empty)", async () => {
    mockPlan.mockResolvedValueOnce(enrichedNeedsInput);
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Create a Slack workflow");
    await screen.findAllByTestId("builder-ai-required-input-control");
    fireEvent.change(screen.getByTestId("builder-ai-required-input-textarea"), {
      target: { value: "Test from ChainReact AI" },
    });
    expect(screen.getByTestId("builder-ai-required-input-textarea")).toHaveValue(
      "Test from ChainReact AI",
    );
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    // After Clear, the entire conversation (incl. the controls block) is gone.
    expect(screen.queryByTestId("builder-ai-required-input-control")).not.toBeInTheDocument();
  });

  it("preserves the AI-20 apply-readiness gate — Apply is hidden while requiredUserInput is non-empty even with enriched controls present", async () => {
    mockPlan.mockResolvedValueOnce(enrichedNeedsInput);
    render(<BuilderAiPanel />);
    await typeAndPlan("Create a Slack workflow");
    await screen.findAllByTestId("builder-ai-required-input-control");
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });

  it("no-leak: the controls block never renders raw patch / config / secret values when the patch carries them", async () => {
    mockPlan.mockResolvedValueOnce({
      ...enrichedNeedsInput,
      proposedPatch: {
        patchId: "p1",
        operations: [
          {
            op: "addNode",
            node: {
              id: "n_slack",
              config: { accessToken: (["xoxb", "LEAKED", "SECRET"].join("-")) },
            },
          },
        ],
      },
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("Create a Slack workflow");
    await screen.findAllByTestId("builder-ai-required-input-control");
    expect(document.body.textContent).not.toContain((["xoxb", "LEAKED", "SECRET"].join("-")));
    expect(document.body.textContent).not.toContain("accessToken");
  });
});

// ─── Slice 4.AI-35E — required-input control parity ─────────────────────────
describe("required-input control parity (AI-35E)", () => {
  it("renders an interactive text control for a bare config_value (null-patch regression: 'What should the Slack DM say?')", async () => {
    // Live regression: a null-patch plan surfaced the missing message as a
    // bare config_value (no nodeId/field, no options). It must render a
    // control, not a static bullet.
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: null,
      canApplyLater: false,
      requiredUserInput: [{ label: "What should the Slack DM say?", kind: "config_value" }],
      preview: undefined,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("Send me a Slack DM when I manually run this workflow");
    const control = await screen.findByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("text");
    expect(screen.getByTestId("builder-ai-required-input-text")).toBeInTheDocument();
  });

  it("renders a provider select for a provider_choice entry", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: null,
      canApplyLater: false,
      requiredUserInput: [
        {
          label: "Which email app should trigger this — Gmail or Outlook?",
          kind: "provider_choice",
          category: "email",
          options: [
            { label: "Gmail", value: "gmail" },
            { label: "Microsoft Outlook", value: "microsoft-outlook" },
          ],
        },
      ],
      preview: undefined,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("When I get an email send a Slack message");
    const control = await screen.findByTestId("builder-ai-required-input-control");
    expect(control.getAttribute("data-variant")).toBe("static-options");
    const select = screen.getByTestId("builder-ai-required-input-select") as HTMLSelectElement;
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(values).toContain("gmail");
    expect(values).toContain("microsoft-outlook");
  });

  it("keeps a non-field clarification as a static bullet (no control)", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: null,
      canApplyLater: false,
      requiredUserInput: [{ label: "Can you clarify the overall goal?", kind: "clarification" }],
      preview: undefined,
    });
    render(<BuilderAiPanel />);
    // AUTOROUTE CS-3 — "Do something" is a vague→clarify prompt; this test pins the
    // planner's clarification-entry rendering, so use a plan-shaped request to reach it.
    await typeAndPlan("Add a step to this workflow");
    const needs = await screen.findByTestId("builder-ai-needs-input");
    expect(needs).toHaveTextContent("Can you clarify the overall goal?");
    // No interactive control for a pure clarification.
    expect(screen.queryByTestId("builder-ai-required-input-control")).not.toBeInTheDocument();
  });
});

// ─── Slice 4.AI-21B — chat layout + pinned composer ─────────────────────────
describe("chat layout (AI-21B)", () => {
  it("renders a message list above a pinned composer (composer follows the list in DOM order)", () => {
    render(<BuilderAiPanel />);
    const panel = screen.getByTestId("builder-ai-panel");
    const list = screen.getByTestId("builder-ai-message-list");
    const composer = screen.getByTestId("builder-ai-composer");
    expect(panel.contains(list)).toBe(true);
    expect(panel.contains(composer)).toBe(true);
    // DOM order: list first, then composer footer (the pinned-bottom
    // placement is implemented via the flex-1 / shrink-0 split rather
    // than position:absolute, so checking DOM order pins the contract).
    const panelChildren = Array.from(panel.children) as HTMLElement[];
    const listIdx = panelChildren.indexOf(list);
    const composerIdx = panelChildren.indexOf(composer);
    expect(listIdx).toBeGreaterThanOrEqual(0);
    expect(composerIdx).toBeGreaterThanOrEqual(0);
    expect(composerIdx).toBeGreaterThan(listIdx);
  });

  it("renders the intro hint before any messages and removes it once the conversation starts", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: true,
      intentSummary: "x",
      assumptions: [],
      requiredUserInput: [],
      unsupportedRequests: [],
      safetyNotes: [],
      proposedPatch: { patchId: "p1", operations: [], summary: "s" },
      preview: planApplyReady.preview,
      canApplyLater: true,
      model: planApplyReady.model,
    });
    render(<BuilderAiPanel />);
    expect(screen.getByTestId("builder-ai-intro")).toBeInTheDocument();
    await typeAndPlan("Send a Slack DM");
    await screen.findByTestId("builder-ai-plan-result");
    expect(screen.queryByTestId("builder-ai-intro")).not.toBeInTheDocument();
  });

  it("appends a user message bubble on submit (newest at the bottom of the list)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan("Send a Slack DM");
    const userMessages = await screen.findAllByTestId("builder-ai-message-user");
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]).toHaveTextContent("Send a Slack DM");
  });

  it("appends an assistant plan_result message after the planner returns (in correct order: user → assistant)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan("Send a Slack DM");
    await screen.findByTestId("builder-ai-plan-result");
    const list = screen.getByTestId("builder-ai-message-list");
    const messages = list.querySelectorAll<HTMLElement>(
      "[data-testid='builder-ai-message-user'], [data-testid='builder-ai-message-assistant']",
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]!.getAttribute("data-testid")).toBe("builder-ai-message-user");
    expect(messages[1]!.getAttribute("data-testid")).toBe("builder-ai-message-assistant");
  });

  it("clears the composer textarea immediately after submit so the user-message bubble is the single live view", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await typeAndPlan("Send a Slack DM");
    expect(screen.getByTestId("builder-ai-prompt")).toHaveValue("");
  });

  it("renders required-input results as the body of the latest assistant plan_result message", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      requiredUserInput: [{ label: "Which Slack channel?", kind: "config_value" }],
      canApplyLater: false,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("Send a Slack DM");
    const assistantMessages = await screen.findAllByTestId(
      "builder-ai-message-assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]!).toContainElement(
      screen.getByTestId("builder-ai-needs-input"),
    );
    expect(assistantMessages[0]!).toContainElement(
      screen.getByTestId("builder-ai-required-input-block"),
    );
  });

  it("follow-up answer renders as a 'followup' user message (data-kind=followup), and the new assistant plan_result follows", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      requiredUserInput: [{ label: "Which Slack channel?", kind: "config_value" }],
      canApplyLater: false,
    });
    mockPlan.mockResolvedValueOnce(planApplyReady); // chain completes
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Send a Slack DM");
    await screen.findByTestId("builder-ai-required-input-block");
    // Send follow-up answer.
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const userMessages = screen.getAllByTestId("builder-ai-message-user");
    expect(userMessages).toHaveLength(2);
    // First user message is the original prompt; second is the follow-up
    // answer. The followup is tagged via data-kind so the UI / future
    // hooks can distinguish them without parsing content.
    expect(userMessages[0]!.getAttribute("data-kind")).toBe("prompt");
    expect(userMessages[0]).toHaveTextContent("Send a Slack DM");
    expect(userMessages[1]!.getAttribute("data-kind")).toBe("followup");
    expect(userMessages[1]).toHaveTextContent("Use #general");
  });

  it("collapses older plan_result messages to their intent summary so the latest message owns the apply UI", async () => {
    const intentA = "Add a Slack post (asking for channel)";
    const intentB = "Add a Slack post";
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      intentSummary: intentA,
      requiredUserInput: [{ label: "Which Slack channel?", kind: "config_value" }],
      canApplyLater: false,
    });
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      intentSummary: intentB,
    });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Send a Slack DM");
    await screen.findByTestId("builder-ai-required-input-block");
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // Older plan_result collapses to summary (no apply button on it).
    const previous = screen.getByTestId("builder-ai-plan-result-previous");
    expect(previous).toHaveTextContent(intentA);
    // Latest plan_result has the full breakdown + the apply button.
    const latest = screen.getByTestId("builder-ai-plan-result");
    expect(latest).toHaveTextContent(intentB);
    expect(screen.getByTestId("builder-ai-apply-button")).toBeEnabled();
  });

  it("composer stays rendered after the assistant responds (pinned bottom)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    expect(screen.getByTestId("builder-ai-composer")).toBeInTheDocument();
    await typeAndPlan("Send a Slack DM");
    await screen.findByTestId("builder-ai-plan-result");
    // After the response, composer is still rendered — it's pinned, not
    // disposed when a plan completes.
    expect(screen.getByTestId("builder-ai-composer")).toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-prompt")).toBeInTheDocument();
  });

  it("apply success renders as a new assistant message — chat-style — without exposing raw patch / config", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      proposedPatch: {
        patchId: "p1",
        operations: [
          { op: "addNode", node: { id: "n2", config: { accessToken: "ya29.LEAKED-SECRET" } } },
        ],
        summary: "s",
      },
    });
    mockApply.mockResolvedValueOnce({
      ok: true,
      appliedPatchId: "p1",
      summaryText: "Applied 1 change to \"Workflow\".",
      updatedAt: "t",
      workflowId: "wf-1",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
    });
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Send a Slack DM");
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    const success = await screen.findByTestId("builder-ai-apply-success");
    expect(success).toHaveTextContent("Applied 1 change");
    // Success is INSIDE an assistant message bubble (chat-style).
    const assistantMessages = screen.getAllByTestId("builder-ai-message-assistant");
    const containingBubble = assistantMessages.find((m) => m.contains(success));
    expect(containingBubble).toBeDefined();
    // No raw secret leaked through the chat-rendered apply success.
    expect(document.body.textContent).not.toContain("ya29.LEAKED-SECRET");
    expect(document.body.textContent).not.toContain("accessToken");
  });

  it("STALE_PATCH renders as an assistant apply_failure bubble with a Re-run button that re-plans from the original prompt", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: false, code: "STALE_PATCH", message: "stale" });
    mockPlan.mockResolvedValueOnce(planApplyReady); // re-run resolves
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Send a Slack DM");
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    const failureBubble = await screen.findByTestId("builder-ai-apply-failure");
    expect(failureBubble).toHaveTextContent(/workflow changed/i);
    const rerun = screen.getByTestId("builder-ai-rerun-button");
    // Re-run does NOT depend on the composer textarea (it's empty post-
    // submit per AI-21B chat pattern); it pulls the most recent user
    // prompt message and re-plans against that.
    expect(screen.getByTestId("builder-ai-prompt")).toHaveValue("");
    expect(rerun).toBeEnabled();
    await user.click(rerun);
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // The reconstructed (well, the re-sent fresh) call uses the prior prompt.
    const [, secondCallBody] = mockPlan.mock.calls[1]!;
    expect((secondCallBody as { prompt: string }).prompt).toBe("Send a Slack DM");
  });

  it("appends an assistant error bubble when a follow-up call fails at the transport layer (chain stays active)", async () => {
    mockPlan.mockResolvedValueOnce({
      ...planApplyReady,
      requiredUserInput: [{ label: "Which Slack channel?", kind: "config_value" }],
      canApplyLater: false,
    });
    mockPlan.mockRejectedValueOnce(new Error("network gone"));
    render(<BuilderAiPanel />);
    const user = await typeAndPlan("Send a Slack DM");
    await screen.findByTestId("builder-ai-required-input-block");
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // The error appears as an assistant chat bubble.
    expect(
      await screen.findByTestId("builder-ai-error-message"),
    ).toHaveTextContent(/unavailable right now|please try again/i);
    // Composer is still in follow-up mode — the chain is preserved by
    // the hook (AI-21 contract).
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent("Send details");
  });

  it("does NOT render the AI-11B inline error twice with the chat-bubble error (top-level builder-ai-error still surfaces 401/404 nuance)", async () => {
    // 401 / 404 nuance — the hook's friendlyError surfaces the specific
    // sign-in / not-found copy via `ai.error`. The top-level
    // `builder-ai-error` line keeps that nuance; the chat-bubble error
    // carries the generic in-conversation copy. Both can coexist; this
    // pins the 401 nuance specifically.
    const ApiErrorCtor = jest.requireMock("@/lib/api/ai").AiApiError;
    mockPlan.mockRejectedValueOnce(new ApiErrorCtor("unauth", 401));
    render(<BuilderAiPanel />);
    await typeAndPlan("Send a Slack DM");
    expect(await screen.findByTestId("builder-ai-error")).toHaveTextContent(
      /please sign in/i,
    );
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
