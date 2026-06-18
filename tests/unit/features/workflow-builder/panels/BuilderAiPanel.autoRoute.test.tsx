/**
 * Tests for the one-composer deterministic intent auto-routing
 * (Slice 4.AI-DIAG-QA-AUTOROUTE-1, CS-3).
 *
 * The single composer submit now routes via classifyComposerIntent:
 * chat-fill (unchanged) → follow-up mode (always planner) → qa | plan | clarify.
 * These tests drive the REAL composer (builder-ai-prompt + builder-ai-plan-button)
 * with @/lib/api/ai mocked, and assert which backend the text reached, the
 * clarification flow, resolve-once, no-leak, and selectedNodeId forwarding.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockDiagnose = jest.fn();
const mockAsk = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    planWorkflow: (...a: unknown[]) => mockPlan(...a),
    applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
    diagnoseWorkflow: (...a: unknown[]) => mockDiagnose(...a),
    askDiagnosisQuestion: (...a: unknown[]) => mockAsk(...a),
    getBuilderAgentThread: (...a: unknown[]) => mockGetThread(...a),
    appendBuilderAgentMessage: (...a: unknown[]) => mockAppendThreadMessage(...a),
    clearBuilderAgentThread: (...a: unknown[]) => mockClearThread(...a),
    AI_CREDITS_EXHAUSTED_MESSAGE: actual.AI_CREDITS_EXHAUSTED_MESSAGE,
    DIAGNOSIS_QA_MAX_QUESTION_LENGTH: actual.DIAGNOSIS_QA_MAX_QUESTION_LENGTH,
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

jest.mock("@/lib/api/workflows", () => ({ getWorkflow: jest.fn() }));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

const planOk = {
  ok: true,
  intentSummary: "Add a Slack step",
  assumptions: [],
  requiredUserInput: [],
  unsupportedRequests: [],
  safetyNotes: [],
  canApplyLater: false,
  model: { modelId: "test", tier: "test", feature: "test" },
};
const answerOk = { ok: true, answer: "Gmail isn't connected.", needsUserDecision: false };

beforeEach(() => {
  mockPlan.mockReset();
  mockPlan.mockResolvedValue(planOk);
  mockApply.mockReset();
  mockDiagnose.mockReset();
  mockAsk.mockReset();
  mockAsk.mockResolvedValue(answerOk);
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "t", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
  useConfigSlice.getState().reset();
});

/** Type into the ONE composer and click its send. */
async function submit(text: string) {
  const user = userEvent.setup();
  render(<BuilderAiPanel />);
  await user.type(screen.getByTestId("builder-ai-prompt"), text);
  await user.click(screen.getByTestId("builder-ai-plan-button"));
  return user;
}

describe("composer auto-route — Q&A", () => {
  it("'Why won't this run?' goes to Q&A, not the planner", async () => {
    await submit("Why won't this run?");
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockAsk.mock.calls[0][1]).toBe("Why won't this run?");
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("'What should I fix first?' goes to Q&A", async () => {
    await submit("What should I fix first?");
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("clears the composer after a Q&A submit", async () => {
    await submit("Why won't this run?");
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect((screen.getByTestId("builder-ai-prompt") as HTMLTextAreaElement).value).toBe("");
  });

  it("forwards configSlice.activeNodeId as selectedNodeId", async () => {
    useConfigSlice.getState().openNode({ nodeId: "node-x", initialValues: {} });
    await submit("Why won't this run?");
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(mockAsk.mock.calls[0][3]).toBe("node-x");
  });

  it("renders no Apply/Preview from a Q&A answer, no raw ids leak", async () => {
    mockAsk.mockResolvedValueOnce({ ok: true, answer: "Reconnect Gmail.", pointers: ["Open Apps"], needsUserDecision: false, nodeId: "node-SECRET", token: "tok-SECRET" });
    await submit("Why won't this run?");
    const body = await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(screen.queryByTestId("builder-ai-apply-button")).toBeNull();
    expect(body.textContent ?? "").not.toContain("node-SECRET");
    expect(body.textContent ?? "").not.toContain("tok-SECRET");
  });
});

describe("composer auto-route — planner", () => {
  it("'Add a Slack step' goes to the planner, not Q&A", async () => {
    await submit("Add a Slack step");
    await screen.findByTestId("builder-ai-plan-result");
    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockPlan.mock.calls[0][1].prompt).toBe("Add a Slack step");
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("'Can you add a Slack step?' goes to the planner", async () => {
    await submit("Can you add a Slack step?");
    await screen.findByTestId("builder-ai-plan-result");
    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
  });
});

describe("composer auto-route — clarify", () => {
  it("'Fix this' appends a clarification and calls neither Q&A nor planner", async () => {
    await submit("Fix this");
    await screen.findByTestId("builder-ai-intent-clarification");
    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockPlan).not.toHaveBeenCalled();
    // Composer cleared after the handled submit.
    expect((screen.getByTestId("builder-ai-prompt") as HTMLTextAreaElement).value).toBe("");
  });

  it("'Why is this broken and fix it?' appends a clarification (mixed intent)", async () => {
    await submit("Why is this broken and fix it?");
    await screen.findByTestId("builder-ai-intent-clarification");
    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("the retained prompt is NOT rendered in the clarification bubble", async () => {
    await submit("fix node-SECRET-ID for me"); // vague 'fix …' → clarify; contains a fake id
    const bubble = await screen.findByTestId("builder-ai-intent-clarification");
    expect(bubble.textContent ?? "").not.toContain("node-SECRET-ID");
  });
});

describe("clarification quick actions route the retained prompt", () => {
  it("'Explain the issue' routes the retained prompt to Q&A", async () => {
    const user = await submit("Fix this");
    await screen.findByTestId("builder-ai-intent-clarification");
    await user.click(screen.getByTestId("builder-ai-clarify-explain"));
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockAsk.mock.calls[0][1]).toBe("Fix this");
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("'Plan a fix' routes the retained prompt to the planner", async () => {
    const user = await submit("Fix this");
    await screen.findByTestId("builder-ai-intent-clarification");
    await user.click(screen.getByTestId("builder-ai-clarify-plan"));
    await screen.findByTestId("builder-ai-plan-result");
    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockPlan.mock.calls[0][1].prompt).toBe("Fix this");
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("resolve-once: choosing one action disables both and a second click does not re-submit", async () => {
    const user = await submit("Fix this");
    await screen.findByTestId("builder-ai-intent-clarification");
    await user.click(screen.getByTestId("builder-ai-clarify-explain"));
    await screen.findByTestId("builder-ai-diagnosis-qa");
    expect(screen.getByTestId("builder-ai-clarify-explain")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-clarify-plan")).toBeDisabled();
    await user.click(screen.getByTestId("builder-ai-clarify-plan")); // disabled → no-op
    expect(mockPlan).not.toHaveBeenCalled();
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });
});

describe("precedence", () => {
  it("follow-up mode routes to the planner even when the text looks like a question", async () => {
    // First plan asks for more input → followUpMode becomes true.
    mockPlan.mockResolvedValueOnce({
      ...planOk,
      requiredUserInput: [{ kind: "clarification", label: "Which channel?" }],
    });
    const user = await submit("Add a Slack step");
    await screen.findByTestId("builder-ai-plan-result");
    expect(mockPlan).toHaveBeenCalledTimes(1);

    // Now a question-shaped follow-up reply must go to the PLANNER (follow-up), not Q&A.
    await user.type(screen.getByTestId("builder-ai-prompt"), "Why won't this run?");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
