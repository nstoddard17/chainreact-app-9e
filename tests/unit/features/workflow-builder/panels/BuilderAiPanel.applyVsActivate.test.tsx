/**
 * Slice 4.AI-35 — React Agent QA fixes: provider-choice controls + the
 * Apply-vs-Activate distinction, exercised through the live BuilderAiPanel.
 *
 * Pins:
 *   - a `provider_choice` required input renders a SELECT control (Gmail /
 *     Outlook), not a static bullet, and Apply stays hidden (null patch).
 *   - a `select_integration` (connect a disconnected provider) does NOT block
 *     Apply — the Apply button shows and a non-blocking "connect before
 *     activating" note renders.
 *   - a missing `config_value` STILL blocks Apply (AI-20 floor) and renders an
 *     interactive control.
 *
 * RTL with the AI + workflows API clients mocked (no fetch / network).
 */
import { render, screen, waitFor } from "@testing-library/react";
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
jest.mock("@/lib/api/workflows", () => ({
  getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
}));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const preview = {
  ok: true,
  riskLevel: "low",
  requiresConfirmation: false,
  affectedNodeIds: ["n1"],
  affectedEdgeIds: [],
  changes: [{ op: "addNode", description: "Adds a node." }],
  validation: { ok: true, errors: [], warnings: [] },
  taskCostEstimate: { estimatedTasksPerRun: 1 },
};
const model = { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" };

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockGetWorkflow.mockReset();
  mockGetWorkflow.mockResolvedValue({ id: "wf-1", draftDefinition: { nodes: [], edges: [] } });
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "thr-1", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({ id: "m", role: "user", kind: "prompt", content: "", safePayload: {}, createdAt: "now" });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

async function typeAndPlan(prompt = "do it") {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("builder-ai-prompt"), prompt);
  await user.click(screen.getByTestId("builder-ai-plan-button"));
  return user;
}

describe("AI-35 — provider_choice renders a selectable control (not a bullet)", () => {
  it("renders a select with Gmail + Outlook options and hides Apply (null patch)", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: true,
      intentSummary: "Send a Slack message when an email arrives.",
      assumptions: [],
      requiredUserInput: [
        {
          label: "Which email app should this use — Gmail or Microsoft Outlook?",
          kind: "provider_choice",
          category: "email",
          options: [
            { label: "Gmail", value: "gmail" },
            { label: "Microsoft Outlook", value: "microsoft-outlook" },
          ],
          allowFreeText: false,
        },
      ],
      unsupportedRequests: [],
      safetyNotes: [],
      canApplyLater: false,
      model,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("When I get an email send a Slack message");

    const select = await screen.findByTestId("builder-ai-required-input-select");
    const optionValues = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(optionValues).toEqual(expect.arrayContaining(["gmail", "microsoft-outlook"]));
    expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument();
  });
});

describe("AI-35 — Apply vs Activate", () => {
  it("a disconnected-provider setup (select_integration) does NOT block Apply", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: true,
      intentSummary: "Send a Slack DM when a Stripe payment fails.",
      assumptions: [],
      requiredUserInput: [{ label: "Connect Stripe", kind: "select_integration" }],
      unsupportedRequests: [],
      safetyNotes: [],
      proposedPatch: { patchId: "p1", operations: [], summary: "s" },
      preview,
      canApplyLater: true,
      model,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("When a Stripe payment fails send me a Slack DM");

    // Apply is available even though Stripe is disconnected …
    expect(await screen.findByTestId("builder-ai-apply-button")).toBeInTheDocument();
    // … and the connection requirement shows as a non-blocking setup note.
    expect(screen.getByTestId("builder-ai-setup-needed")).toHaveTextContent(/Connect Stripe/i);
  });

  it("a missing config_value STILL blocks Apply and renders a control (AI-20 floor)", async () => {
    mockPlan.mockResolvedValueOnce({
      ok: true,
      intentSummary: "Send a Slack message.",
      assumptions: [],
      requiredUserInput: [
        {
          label: "What should the message say?",
          kind: "config_value",
          nodeId: "n1",
          field: "text",
          fieldType: "textarea",
          allowFreeText: true,
        },
      ],
      unsupportedRequests: [],
      safetyNotes: [],
      proposedPatch: { patchId: "p1", operations: [], summary: "s" },
      preview,
      canApplyLater: false,
      model,
    });
    render(<BuilderAiPanel />);
    await typeAndPlan("Send a Slack message");

    expect(await screen.findByTestId("builder-ai-required-input-text")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("builder-ai-apply-button")).not.toBeInTheDocument(),
    );
  });
});
