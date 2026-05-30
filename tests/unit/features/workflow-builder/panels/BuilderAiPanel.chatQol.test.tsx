/**
 * Slice 4.REACT-AGENT-CHAT-QOL-1 — chat quality-of-life:
 *   Part A — Enter submits the composer; Shift+Enter inserts a newline;
 *            whitespace-only / pending never submit; Enter inside a
 *            required-input control does NOT submit.
 *   Part B — an inline "Send details" button renders under the ACTIVE
 *            required-input controls and uses the SAME submit path as the
 *            bottom composer button.
 *   Part C/D — no duplicate submit/call; only the latest required-input block
 *            shows an active inline button; persisted history shows none.
 *
 * RTL with the AI + workflows API clients mocked (no fetch / network). The
 * combobox test additionally mocks `useOptionsSource` so the dynamic picker
 * resolves without a network call.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPlan = jest.fn();
const mockApply = jest.fn();
const mockComplete = jest.fn();
const mockGetThread = jest.fn();
const mockAppendThreadMessage = jest.fn();
const mockClearThread = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  planWorkflow: (...a: unknown[]) => mockPlan(...a),
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  completePlan: (...a: unknown[]) => mockComplete(...a),
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

// Combobox test only — make the dynamic picker resolve to a ready list with no
// network. Inert for every other test (those use textarea controls that never
// mount the optionsSource control).
const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
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
const model = {
  modelId: "claude-sonnet-4-6",
  tier: "strong",
  feature: "creation",
  finishReason: "stop",
};

/** A plan that asks for one config_value textarea field (blocks Apply). */
function textareaNeedsInputPlan(label = "What should the message say?") {
  return {
    ok: true,
    intentSummary: "Send a Slack message.",
    assumptions: [],
    requiredUserInput: [
      {
        label,
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
  };
}

/** A completed plan (no outstanding input) — what completePlan resolves to. */
const completedPlan = {
  ok: true,
  intentSummary: "Send a Slack message.",
  assumptions: [],
  requiredUserInput: [],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p1", operations: [], summary: "s" },
  preview,
  canApplyLater: true,
  model,
};

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockComplete.mockReset();
  mockComplete.mockResolvedValue(completedPlan);
  mockGetWorkflow.mockReset();
  mockGetWorkflow.mockResolvedValue({
    id: "wf-1",
    draftDefinition: { nodes: [], edges: [] },
  });
  mockGetThread.mockReset();
  mockGetThread.mockResolvedValue({
    thread: { id: "thr-1", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
    messages: [],
  });
  mockAppendThreadMessage.mockReset();
  mockAppendThreadMessage.mockResolvedValue({
    id: "m",
    role: "user",
    kind: "prompt",
    content: "",
    safePayload: {},
    createdAt: "now",
  });
  mockClearThread.mockReset();
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 0 });
  mockUseOptionsSource.mockReset();
  mockUseOptionsSource.mockReturnValue({
    state: {
      status: "ready",
      items: [{ value: "C123", label: "#general" }],
    },
  });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

// ─── Part A — Enter-to-send ──────────────────────────────────────────────────

describe("REACT-AGENT-CHAT-QOL-1 — Part A: Enter-to-send", () => {
  it("pressing Enter in the composer submits the prompt", async () => {
    mockPlan.mockResolvedValueOnce(completedPlan);
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "Build a Slack workflow");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(1));
    expect(mockPlan.mock.calls[0]![1]).toMatchObject({
      prompt: "Build a Slack workflow",
    });
  });

  it("Shift+Enter inserts a newline and does NOT submit", async () => {
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    const textarea = screen.getByTestId("builder-ai-prompt") as HTMLTextAreaElement;
    await user.type(textarea, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(textarea, "line two");
    expect(textarea.value).toBe("line one\nline two");
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("whitespace-only Enter does not submit", async () => {
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "    ");
    await user.keyboard("{Enter}");
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it("Enter during a pending request does not double-submit", async () => {
    // A never-resolving plan keeps the panel in the planning (busy) state.
    let resolvePlan: ((v: unknown) => void) | undefined;
    mockPlan.mockReturnValueOnce(
      new Promise((res) => {
        resolvePlan = res;
      }),
    );
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    const textarea = screen.getByTestId("builder-ai-prompt");
    await user.type(textarea, "Build it");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(1));
    // The composer textarea is disabled while busy; a second Enter is a no-op.
    await user.keyboard("{Enter}");
    expect(mockPlan).toHaveBeenCalledTimes(1);
    // Resolve to avoid an act() warning on unmount.
    resolvePlan?.(completedPlan);
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(1));
  });

  it("clicking the bottom composer button still submits (no regression)", async () => {
    mockPlan.mockResolvedValueOnce(completedPlan);
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Build it");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(1));
  });

  it("Enter inside a required-input textarea control does NOT submit a follow-up", async () => {
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan());
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    const control = await screen.findByTestId("builder-ai-required-input-textarea");
    await user.type(control, "first line");
    await user.keyboard("{Enter}");
    await user.type(control, "second line");
    // Newline was entered inside the control; no follow-up submission fired.
    expect((control as HTMLTextAreaElement).value).toContain("\n");
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(1); // only the initial plan
  });
});

// ─── Part B / C — inline "Send details" button ───────────────────────────────

describe("REACT-AGENT-CHAT-QOL-1 — Part B: inline Send details", () => {
  it("renders an inline Send details button under the active required-input controls", async () => {
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan());
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    const inline = await screen.findByTestId("builder-ai-send-details-inline");
    expect(inline).toBeInTheDocument();
    // Disabled until something is staged (no composer text, no answers yet).
    expect(inline).toBeDisabled();
  });

  it("filling the control enables the inline button; clicking it submits the staged answer (deterministic completion, no duplicate call)", async () => {
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan());
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    await screen.findByTestId("builder-ai-required-input-textarea");
    await user.type(
      screen.getByTestId("builder-ai-required-input-textarea"),
      "Hello team",
    );
    const inline = screen.getByTestId("builder-ai-send-details-inline");
    expect(inline).toBeEnabled();

    await user.click(inline);

    // The staged answer flowed through the deterministic completion route…
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    const completeArgs = mockComplete.mock.calls[0]![1] as {
      answers: ReadonlyArray<{ nodeId?: string; field?: string; value: string }>;
    };
    expect(completeArgs.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "n1", field: "text", value: "Hello team" }),
      ]),
    );
    // …with NO duplicate model re-plan (only the initial plan ran).
    expect(mockPlan).toHaveBeenCalledTimes(1);
  });

  it("the inline button uses the SAME submit path as the bottom composer button", async () => {
    // Bottom-button baseline.
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan());
    const user = userEvent.setup();
    const view = render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-required-input-textarea");
    await user.type(
      screen.getByTestId("builder-ai-required-input-textarea"),
      "Hello team",
    );
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    const fromBottom = mockComplete.mock.calls[0]![1];
    view.unmount();

    // Reset + re-run, this time submitting via the INLINE button.
    mockComplete.mockClear();
    mockPlan.mockReset();
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan());
    useGraphSlice.getState().reset();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-required-input-textarea");
    await user.type(
      screen.getByTestId("builder-ai-required-input-textarea"),
      "Hello team",
    );
    await user.click(screen.getByTestId("builder-ai-send-details-inline"));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    const fromInline = mockComplete.mock.calls[0]![1];

    // Identical payload → identical submit path.
    expect(fromInline).toEqual(fromBottom);
  });
});

// ─── Part B — combobox staging + inline submit ───────────────────────────────

describe("REACT-AGENT-CHAT-QOL-1 — combobox control", () => {
  function comboboxNeedsInputPlan() {
    return {
      ok: true,
      intentSummary: "Post to a Slack channel.",
      assumptions: [],
      requiredUserInput: [
        {
          label: "Which channel?",
          kind: "config_value",
          nodeId: "n1",
          field: "channel",
          fieldType: "combobox",
          optionsSource: { providerId: "slack", resourceType: "channels" },
          allowFreeText: true,
        },
      ],
      unsupportedRequests: [],
      safetyNotes: [],
      proposedPatch: { patchId: "p1", operations: [], summary: "s" },
      preview,
      canApplyLater: false,
      model,
    };
  }

  it("Enter in the combobox query input does not submit; selecting an option stages it; inline Send details submits the selected value", async () => {
    mockPlan.mockResolvedValueOnce(comboboxNeedsInputPlan());
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Post to Slack");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    // The dynamic combobox query input renders (no submit on Enter — it has no
    // keydown handler, so combobox keyboard behavior is unaffected by Part A).
    const queryInput = await screen.findByTestId(
      "builder-ai-required-input-combobox-query",
    );
    await user.type(queryInput, "gen");
    await user.keyboard("{Enter}");
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockPlan).toHaveBeenCalledTimes(1);

    // Selecting an option stages its value.
    await user.click(screen.getByTestId("builder-ai-required-input-option"));
    const inline = screen.getByTestId("builder-ai-send-details-inline");
    expect(inline).toBeEnabled();

    await user.click(inline);
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    const args = mockComplete.mock.calls[0]![1] as {
      answers: ReadonlyArray<{ nodeId?: string; field?: string; value: string }>;
    };
    expect(args.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "n1", field: "channel", value: "C123" }),
      ]),
    );
  });
});

// ─── Part D — historical / read-only safety ──────────────────────────────────

describe("REACT-AGENT-CHAT-QOL-1 — Part D: only the active block shows the inline button", () => {
  it("after a second required-input turn, only the latest block shows an inline Send details button", async () => {
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan("First detail?"));
    // The follow-up carries free text → model re-plan (not deterministic), and
    // returns ANOTHER required-input plan so the chain continues.
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan("Second detail?"));
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-send-details-inline");

    // Free-text follow-up → forces a model re-plan with a second needs-input plan.
    await user.type(screen.getByTestId("builder-ai-prompt"), "and use channel general");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));

    // Two plan_result bubbles exist; only the latest renders controls → exactly
    // one inline Send details button.
    await waitFor(() =>
      expect(
        screen.getAllByTestId("builder-ai-send-details-inline"),
      ).toHaveLength(1),
    );
  });

  it("a persisted plan_result thread renders no inline Send details button", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
      messages: [
        {
          id: "p1",
          role: "user",
          kind: "prompt",
          content: "Post to Slack",
          safePayload: {},
          createdAt: "2026-05-29T00:00:01Z",
        },
        {
          id: "p2",
          role: "assistant",
          kind: "plan_result",
          content: "Add a Slack post",
          safePayload: { ok: true, intentSummary: "Add a Slack post", canApplyLater: true },
          createdAt: "2026-05-29T00:00:02Z",
        },
      ],
    });
    render(<BuilderAiPanel />);
    // The persisted plan renders as a read-only previous-turn summary.
    await screen.findByTestId("builder-ai-plan-result-previous");
    expect(
      screen.queryByTestId("builder-ai-send-details-inline"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("builder-ai-required-input-control"),
    ).not.toBeInTheDocument();
  });
});

// Sanity: the inline submit appends exactly one user "answer" bubble (no
// duplicate message) — guards Part C's no-duplicate-message contract.
describe("REACT-AGENT-CHAT-QOL-1 — no duplicate message on inline submit", () => {
  it("appends exactly one user answer bubble when the inline button is clicked", async () => {
    mockPlan.mockResolvedValueOnce(textareaNeedsInputPlan());
    const user = userEvent.setup();
    render(<BuilderAiPanel />);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-required-input-textarea");
    await user.type(
      screen.getByTestId("builder-ai-required-input-textarea"),
      "Hello team",
    );
    await user.click(screen.getByTestId("builder-ai-send-details-inline"));

    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    // The follow-up answer bubble (a "followup" user message) appears once.
    const followups = screen
      .getAllByTestId("builder-ai-message-user")
      .filter((el) => el.getAttribute("data-kind") === "followup");
    expect(followups).toHaveLength(1);
    expect(within(followups[0]!).getByText(/Hello team/)).toBeInTheDocument();
  });
});
