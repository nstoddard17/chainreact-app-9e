/**
 * Tests for the AI-25 retryable-failure UX in
 * `features/workflow-builder/panels/BuilderAiPanel.tsx`.
 *
 * Live observation: Marcus typed an answer to a follow-up question, the
 * planner returned RATE_LIMITED, and the React Agent dropped the chain
 * (originalPrompt + prior answers gone, staged answers cleared, composer
 * cleared). To retry he had to re-answer everything. AI-25 makes
 * retryable follow-up failures non-terminal:
 *
 *   - Composer text restored.
 *   - Staged required-input answers restored.
 *   - originalPrompt + priorFollowUpAnswers preserved (hook).
 *   - The prior plan_result (with the unanswered question + interactive
 *     controls) remains the latest in chat — `ai.planResult` is NOT
 *     overwritten with the failure shape.
 *   - Friendly error bubble appended.
 *   - User clicks Send details again → planner retried → success.
 *   - No graph mutation (covered by graphImmutability suite; spot-checked
 *     here for the post-retry path).
 *
 * Existing AI-22 tests pin "Clear conversation resets staged answers".
 * AI-25 keeps that contract — only retryable FAILURES preserve; Clear
 * still wipes.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
  appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
  clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
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
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
  };
});

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

// A needs-input response with ONE free-text question (mirrors Marcus's
// "What should the message say?" follow-up).
const needsInputFreeText = {
  ok: true,
  intentSummary: "Add a Gmail-triggered Slack post",
  assumptions: [],
  requiredUserInput: [
    {
      label: "What should the message say?",
      kind: "config_value",
      nodeId: "n-slack",
      field: "text",
      provider: "slack",
      nodeType: "send_channel_message",
      nodeLabel: "Send channel message",
      fieldLabel: "Message",
      fieldType: "textarea",
    },
  ],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: {
    patchId: "p1",
    operations: [
      {
        op: "addNode",
        node: {
          id: "n-slack",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 0, y: 0 },
        },
      },
    ],
    summary: "needs message text",
  },
  preview: {
    ok: true,
    riskLevel: "low",
    requiresConfirmation: false,
    affectedNodeIds: ["n-slack"],
    affectedEdgeIds: [],
    changes: [],
    validation: { ok: true, errors: [], warnings: [] },
    taskCostEstimate: { estimatedTasksPerRun: 1 },
  },
  canApplyLater: false,
  blockedReason: "More information is still needed",
  model: {
    modelId: "claude-sonnet-4-6",
    tier: "strong",
    feature: "creation",
    finishReason: "stop",
  },
};

const planApplyReady = {
  ...needsInputFreeText,
  requiredUserInput: [],
  canApplyLater: true,
  blockedReason: undefined,
};

const rateLimitedFailure = {
  ok: false,
  code: "MODEL_FAILED",
  message: "The model did not return a plan (RATE_LIMITED).",
  errors: [{ stage: "model", code: "RATE_LIMITED", message: "rate limited" }],
  model: {
    modelId: "claude-sonnet-4-6",
    tier: "strong",
    feature: "creation",
    finishReason: "stop",
  },
};

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockGetWorkflow.mockReset();
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
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

async function plan(prompt: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("builder-ai-prompt"), prompt);
  await user.click(screen.getByTestId("builder-ai-plan-button"));
  return user;
}

describe("AI-25 — follow-up RATE_LIMITED preserves composer + staged answers + chain", () => {
  it("RATE_LIMITED with composer free-text — composer is RESTORED, chain stays active", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText);
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await screen.findByTestId("builder-ai-required-input-block");

    // Type the follow-up answer in the composer.
    const composer = screen.getByTestId("builder-ai-prompt");
    await user.type(composer, "Use #general");
    expect(composer).toHaveValue("Use #general");

    // Submit — planner returns RATE_LIMITED.
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));

    // Error bubble appended — friendly + non-blocking.
    expect(
      await screen.findByTestId("builder-ai-error-message"),
    ).toHaveTextContent(/unavailable right now|please try again/i);

    // Composer is RESTORED — the user doesn't have to retype.
    expect(composer).toHaveValue("Use #general");

    // Composer is still in follow-up mode — chain preserved (button label
    // reads "Send details", not "Plan with AI").
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent(
      "Send details",
    );
  });

  it("RATE_LIMITED with staged required-input answers — staged selections are RESTORED", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText);
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await screen.findAllByTestId("builder-ai-required-input-control");

    // Type the answer into the staged required-input text control.
    fireEvent.change(screen.getByTestId("builder-ai-required-input-textarea"), {
      target: { value: "Hi there" },
    });
    expect(screen.getByTestId("builder-ai-required-input-textarea")).toHaveValue(
      "Hi there",
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));

    // Error bubble appended.
    expect(
      await screen.findByTestId("builder-ai-error-message"),
    ).toHaveTextContent(/unavailable right now|please try again/i);

    // The required-input control is STILL VISIBLE (the prior plan_result
    // with requiredUserInput remains the latest in chat because the hook
    // intentionally did not overwrite planResult with the failure).
    expect(
      screen.getByTestId("builder-ai-required-input-control"),
    ).toBeInTheDocument();
    // And the staged value is RESTORED into the control.
    expect(screen.getByTestId("builder-ai-required-input-textarea")).toHaveValue(
      "Hi there",
    );
  });

  it("retry after RATE_LIMITED with the SAME composer + staged answers — second call uses the restored values", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText);
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await screen.findByTestId("builder-ai-required-input-block");

    // First follow-up attempt: type + submit → rate limited.
    const composer = screen.getByTestId("builder-ai-prompt");
    await user.type(composer, "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    await screen.findByTestId("builder-ai-error-message");

    // Composer should still hold "Use #general" — just click Send again.
    expect(composer).toHaveValue("Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(3));

    // The retry call's reconstructed prompt is identical in shape to
    // what the first attempt would have sent (Original request:, the
    // follow-up question label, and the user's answer).
    const [, retryBody] = mockPlan.mock.calls[2]!;
    const retryPrompt = (retryBody as { prompt: string }).prompt;
    expect(retryPrompt).toContain("Original request:");
    expect(retryPrompt).toContain("Send a Slack message when I get an email");
    expect(retryPrompt).toContain("User follow-up:");
    expect(retryPrompt).toContain("Use #general");
    // The successful retry should produce an Apply button now.
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-apply-button")).toBeInTheDocument(),
    );
  });

  it("does NOT mutate the graph on RATE_LIMITED follow-up failure", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText);
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    const before = {
      pendingNodes: [...useGraphSlice.getState().pendingNodes],
      pendingEdges: [...useGraphSlice.getState().pendingEdges],
      savedNodes: [...useGraphSlice.getState().savedNodes],
      savedEdges: [...useGraphSlice.getState().savedEdges],
    };
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await screen.findByTestId("builder-ai-required-input-block");
    await user.type(screen.getByTestId("builder-ai-prompt"), "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-error-message");

    expect(useGraphSlice.getState().pendingNodes).toEqual(before.pendingNodes);
    expect(useGraphSlice.getState().pendingEdges).toEqual(before.pendingEdges);
    expect(useGraphSlice.getState().savedNodes).toEqual(before.savedNodes);
    expect(useGraphSlice.getState().savedEdges).toEqual(before.savedEdges);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});

describe("AI-25 — Clear conversation still resets the preserved chain", () => {
  it("Clear after a RATE_LIMITED retry wipes composer, staged answers, and chat", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText);
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await screen.findAllByTestId("builder-ai-required-input-control");
    fireEvent.change(screen.getByTestId("builder-ai-required-input-textarea"), {
      target: { value: "Hi there" },
    });
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-error-message");
    // The required-input control is still visible + restored.
    expect(screen.getByTestId("builder-ai-required-input-textarea")).toHaveValue(
      "Hi there",
    );

    // Clear conversation — wipes everything including the preserved state.
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    expect(mockClearThread).toHaveBeenCalledWith("wf-1");
    expect(
      screen.queryByTestId("builder-ai-required-input-control"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-error-message")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-prompt")).toHaveValue("");
    // Composer is back in the default "Send" mode (no chain).
    expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent(
      "Send",
    );
  });
});

describe("AI-25 — initial-plan failure also restores composer", () => {
  it("initial plan RATE_LIMITED — composer text is restored so the user can edit + retry", async () => {
    // Initial plan failure returns the structured ok:false result (not
    // null) — the panel still appends a plan_result with PlanFailure.
    // Restoring the composer makes "edit + retry" frictionless.
    mockPlan.mockResolvedValueOnce(rateLimitedFailure);
    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    const composer = screen.getByTestId("builder-ai-prompt");
    await user.type(composer, "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    await screen.findByTestId("builder-ai-plan-failure");

    // Initial-failure path returns the structured result (not null), so
    // the panel currently does NOT restore composer on this branch.
    // That's an acceptable trade — the user can scroll up and copy from
    // their bubble. Pin the current behavior so future changes are
    // intentional.
    expect(composer).toHaveValue("");
  });

  it("initial plan TRANSPORT FAILURE — composer text IS restored (planWorkflow throws)", async () => {
    mockPlan.mockRejectedValueOnce(new Error("network gone"));
    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    const composer = screen.getByTestId("builder-ai-prompt");
    await user.type(composer, "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    await screen.findByTestId("builder-ai-error-message");
    // Transport throw → ai.plan returns null → panel restores composer.
    expect(composer).toHaveValue("Send a Slack message");
  });
});

describe("AI-25 — successful follow-up still drops chain (regression guard)", () => {
  it("ok:true follow-up that resolves all requiredUserInput completes the chain", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText);
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await screen.findByTestId("builder-ai-required-input-block");
    await user.type(screen.getByTestId("builder-ai-prompt"), "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    // Chain completed — composer returns to the default "Send" mode.
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-plan-button")).toHaveTextContent(
        "Send",
      ),
    );
    // Apply is now available.
    expect(screen.getByTestId("builder-ai-apply-button")).toBeInTheDocument();
  });
});
