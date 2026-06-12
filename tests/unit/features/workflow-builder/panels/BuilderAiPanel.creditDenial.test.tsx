/**
 * Tests for the AI-credit denial UX in
 * `features/workflow-builder/panels/BuilderAiPanel.tsx` (Slice 4.AI-CREDITS-3b-ii).
 *
 * When `/api/workflows/[id]/ai/plan` refuses with a structured `ok:false` body
 * (`code: "AI_CREDITS_EXHAUSTED"`, HTTP 402), the panel must render the
 * credit-specific message in a plan_result bubble (`builder-ai-plan-failure`) —
 * NOT the generic "AI assistant unavailable" error bubble
 * (`builder-ai-error-message`) — on BOTH the fresh-plan and the follow-up path.
 *
 * The real `AI_CREDITS_EXHAUSTED_MESSAGE` is threaded through the mock via
 * `requireActual` so `PlanFailure` renders the actual shipped copy.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockComplete = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: (...a: unknown[]) => mockPlan(...a),
    completePlan: (...a: unknown[]) => mockComplete(...a),
    applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
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
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
  };
});

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { AI_CREDITS_EXHAUSTED_MESSAGE } from "@/lib/api/ai";

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
  model: { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" },
};

// What the route returns on a gate denial (structured ok:false, HTTP 402). The
// client's postStructured returns it as a result (it carries an `ok` flag).
const creditDenial = {
  ok: false,
  code: "AI_CREDITS_EXHAUSTED",
  message: "You've used all your AI credits for this billing period.",
  used: 20,
  limit: 20,
  errors: [
    { stage: "billing", code: "AI_CREDITS_EXHAUSTED", message: "AI credit limit reached." },
  ],
};

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockComplete.mockReset();
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

describe("AI-CREDITS-3b-ii — fresh-plan credit denial", () => {
  it("renders the credit-specific message in a plan_result bubble, not the generic error", async () => {
    mockPlan.mockResolvedValueOnce(creditDenial);
    render(<BuilderAiPanel />);
    await plan("Build me a Slack workflow");
    const failure = await screen.findByTestId("builder-ai-plan-failure");
    expect(failure).toHaveTextContent(AI_CREDITS_EXHAUSTED_MESSAGE);
    // NOT the generic "unavailable" error bubble.
    expect(screen.queryByTestId("builder-ai-error-message")).not.toBeInTheDocument();
  });

  it("leaks no account id / credit counter / planner-error metadata", async () => {
    mockPlan.mockResolvedValueOnce(creditDenial);
    render(<BuilderAiPanel />);
    await plan("Build me a Slack workflow");
    const failure = await screen.findByTestId("builder-ai-plan-failure");
    const text = failure.textContent ?? "";
    expect(text).not.toMatch(/Planner error/i);
    // The raw error code / stage / account / model are never surfaced (the
    // friendly copy's "billing period" wording is fine — guard the technical token).
    expect(text).not.toContain("AI_CREDITS_EXHAUSTED");
    expect(text).not.toContain("acct-");
    expect(text).not.toContain("claude-sonnet");
    // The raw used/limit integers are not rendered as bare numbers in the copy.
    expect(screen.queryByTestId("builder-ai-plan-failure-detail")).not.toBeInTheDocument();
  });
});

describe("AI-CREDITS-3b-ii — follow-up credit denial", () => {
  it("renders the credit-specific message (not the generic 'unavailable' bubble) on a follow-up denial", async () => {
    mockPlan.mockResolvedValueOnce(needsInputFreeText); // turn 1 — asks for message text
    mockPlan.mockResolvedValueOnce(creditDenial); // follow-up — gate denies
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await screen.findByTestId("builder-ai-required-input-block");

    await user.type(screen.getByTestId("builder-ai-prompt"), "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));

    // The denial renders as a plan_result failure bubble with the credit copy …
    const failure = await screen.findByTestId("builder-ai-plan-failure");
    expect(failure).toHaveTextContent(AI_CREDITS_EXHAUSTED_MESSAGE);
    // … and NOT the generic "AI assistant unavailable" error bubble.
    expect(screen.queryByTestId("builder-ai-error-message")).not.toBeInTheDocument();
  });
});
