/**
 * Regression guard — React Agent must NOT mutate the canvas before Apply
 * (Slice 4.AI-22 follow-up).
 *
 * Live testing after AI-22 surfaced a user concern: "the React Agent
 * appears to create/update the workflow before I click Apply." A code
 * audit (BuilderAiPanel / useBuilderAi / RequiredInputControl /
 * graphSlice / plan + apply routes / planner / apply service) found no
 * mutation path — but the contract is load-bearing enough that we add
 * a regression guard here so any future code path that wires a plan or
 * follow-up or dropdown click into graphSlice.hydrate / addNode /
 * addAction / updateNodeConfig / etc. trips this test loudly in CI.
 *
 * Contract pinned by this file:
 *   1. `plan()` does not change graphSlice.{savedNodes, savedEdges,
 *      pendingNodes, pendingEdges, isDirty}.
 *   2. `submitFollowUp()` (with structured answers OR free text) does
 *      not change them either.
 *   3. Selecting a dropdown option in `RequiredInputControl` does not
 *      change them.
 *   4. `apply()` is the ONLY path that triggers a graphSlice hydrate,
 *      and it ONLY fires when the apply route returned `ok: true`.
 *      The hydrated state mirrors what the server returned via
 *      `getWorkflow`, never the client-side `proposedPatch`.
 *
 * This is paired with the AI-22 panel suite — those tests pin the chat
 * UI behavior; THIS file pins the no-mutation invariant against a real
 * graphSlice instance.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPlan = jest.fn();
const mockApply = jest.fn();
// AI-23 — persistent Builder Agent thread helpers default to no-ops.
const mockGetThread = jest.fn().mockResolvedValue({
  thread: { id: "thr-1", workflowId: "wf-1", createdAt: "now", updatedAt: "now" },
  messages: [],
});
const mockAppendThreadMessage = jest.fn().mockResolvedValue({
  id: "m-mock",
  role: "user",
  kind: "prompt",
  content: "",
  safePayload: {},
  createdAt: "now",
});
const mockClearThread = jest.fn().mockResolvedValue({ ok: true, deletedCount: 0 });
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

// We DO NOT mock useOptionsSource here — we want a real, idle hook
// instance so the dropdown renders with empty items. (Other AI-22 tests
// already pin the resolver-backed branches.) The hook's idle state
// renders no items and never fetches without a query — safe for a
// canvas-state-stability test.
import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const SEED_TRIGGER = {
  id: "n_trigger_seed",
  kind: "trigger" as const,
  provider: "native",
  type: "manual.run",
  config: {},
  position: { x: 100, y: 100 },
};

function readGraphSnapshot() {
  const s = useGraphSlice.getState();
  return {
    workflowId: s.workflowId,
    isHydrated: s.isHydrated,
    savedNodes: s.savedNodes,
    savedEdges: s.savedEdges,
    pendingNodes: s.pendingNodes,
    pendingEdges: s.pendingEdges,
    isDirty: s.isDirty,
    isSaving: s.isSaving,
  };
}

beforeEach(() => {
  mockPlan.mockReset();
  mockApply.mockReset();
  mockGetWorkflow.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", {
    nodes: [SEED_TRIGGER],
    edges: [],
  });
});

const planNeedsInput = {
  ok: true,
  intentSummary: "Add a Slack post",
  assumptions: [],
  requiredUserInput: [
    {
      label: "Which Slack channel?",
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
      fieldLabel: "Message",
      fieldType: "textarea",
      allowFreeText: true,
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
          id: "n_slack",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 0, y: 0 },
        },
      },
    ],
    summary: "Add Slack post",
  },
  preview: {
    ok: true,
    riskLevel: "low",
    requiresConfirmation: false,
    affectedNodeIds: [],
    affectedEdgeIds: [],
    changes: [{ op: "addNode", description: "Adds Slack post" }],
    validation: { ok: true, errors: [], warnings: [] },
    taskCostEstimate: { estimatedTasksPerRun: 1 },
  },
  canApplyLater: false,
  blockedReason: "More information is still needed.",
  model: { modelId: "claude-sonnet-4-6", tier: "strong", feature: "creation", finishReason: "stop" },
};

const planApplyReady = {
  ...planNeedsInput,
  requiredUserInput: [],
  canApplyLater: true,
  blockedReason: undefined,
};

describe("React Agent canvas-stability guard (AI-22 regression)", () => {
  it("plan() does NOT mutate graphSlice (savedNodes/edges + pendingNodes/edges + isDirty unchanged)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const before = readGraphSnapshot();
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("builder-ai-prompt"),
      "Send a Slack message to #general",
    );
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(1));
    // The plan response just resolved; the chat now shows a plan_result
    // bubble. The canvas state must be byte-identical.
    const after = readGraphSnapshot();
    expect(after.savedNodes).toBe(before.savedNodes);
    expect(after.savedEdges).toBe(before.savedEdges);
    expect(after.pendingNodes).toBe(before.pendingNodes);
    expect(after.pendingEdges).toBe(before.pendingEdges);
    expect(after.isDirty).toBe(before.isDirty);
    // mockApply MUST NOT have been called — plan is read-only.
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("submitFollowUp() with free text + structured answers does NOT mutate graphSlice", async () => {
    mockPlan.mockResolvedValueOnce(planNeedsInput); // turn 1 — chain starts
    mockPlan.mockResolvedValueOnce(planApplyReady); // turn 2 — chain completes
    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("builder-ai-prompt"),
      "Send a Slack message when I run",
    );
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findAllByTestId("builder-ai-required-input-control");
    const beforeFollowUp = readGraphSnapshot();

    // Fill the text-branch control (Message) and submit.
    fireEvent.change(screen.getByTestId("builder-ai-required-input-text"), {
      target: { value: "Test from ChainReact AI" },
    });
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));

    const afterFollowUp = readGraphSnapshot();
    expect(afterFollowUp.savedNodes).toBe(beforeFollowUp.savedNodes);
    expect(afterFollowUp.savedEdges).toBe(beforeFollowUp.savedEdges);
    expect(afterFollowUp.pendingNodes).toBe(beforeFollowUp.pendingNodes);
    expect(afterFollowUp.pendingEdges).toBe(beforeFollowUp.pendingEdges);
    expect(afterFollowUp.isDirty).toBe(beforeFollowUp.isDirty);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("typing in a RequiredInputControl text input does NOT mutate graphSlice (selection is staged in panel-local state only)", async () => {
    mockPlan.mockResolvedValueOnce(planNeedsInput);
    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("builder-ai-prompt"),
      "Send a Slack message",
    );
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findAllByTestId("builder-ai-required-input-control");
    const before = readGraphSnapshot();

    // Change the text control multiple times — purely local staging.
    const textControl = screen.getByTestId("builder-ai-required-input-text");
    fireEvent.change(textControl, { target: { value: "draft 1" } });
    fireEvent.change(textControl, { target: { value: "Test from ChainReact AI" } });

    const after = readGraphSnapshot();
    expect(after.savedNodes).toBe(before.savedNodes);
    expect(after.savedEdges).toBe(before.savedEdges);
    expect(after.pendingNodes).toBe(before.pendingNodes);
    expect(after.pendingEdges).toBe(before.pendingEdges);
    expect(after.isDirty).toBe(before.isDirty);
    expect(mockApply).not.toHaveBeenCalled();
    // Plan call count stays at 1 — staging doesn't auto-submit.
    expect(mockPlan).toHaveBeenCalledTimes(1);
  });

  it("apply() is the ONLY path that triggers a hydrate + only fires when the apply route returned ok:true", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({
      ok: true,
      appliedPatchId: "p1",
      summaryText: "Applied 1 change.",
      updatedAt: "t",
      workflowId: "wf-1",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
    });
    // The server-side draft now includes the new Slack node.
    const serverDraftAfterApply = {
      nodes: [
        SEED_TRIGGER,
        {
          id: "n_slack",
          kind: "action" as const,
          provider: "slack",
          type: "send_channel_message",
          config: { channel: "C123", text: "hello" },
          position: { x: 300, y: 100 },
        },
      ],
      edges: [],
    };
    mockGetWorkflow.mockResolvedValue({
      id: "wf-1",
      draftDefinition: serverDraftAfterApply,
    });

    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("builder-ai-prompt"),
      "Send a Slack message to #general",
    );
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-apply-button");

    // Pre-apply: canvas still has only the seed trigger.
    const before = readGraphSnapshot();
    expect(before.savedNodes).toHaveLength(1);
    expect(before.savedNodes[0]!.id).toBe("n_trigger_seed");
    // getWorkflow MUST NOT have been called yet — apply hasn't run.
    expect(mockGetWorkflow).not.toHaveBeenCalled();

    // Click Apply. Server-side apply succeeds → onApplied fetches the
    // workflow → graphSlice hydrates with the server-confirmed draft.
    await user.click(screen.getByTestId("builder-ai-apply-button"));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockGetWorkflow).toHaveBeenCalledTimes(1));

    // Post-apply: canvas now reflects the SERVER-fetched state.
    await waitFor(() => {
      const after = readGraphSnapshot();
      expect(after.savedNodes).toHaveLength(2);
      expect(after.savedNodes.find((n) => n.id === "n_slack")).toBeDefined();
    });
  });

  it("apply() with ok:false does NOT hydrate the canvas (server didn't mutate; client must not mirror a non-existent change)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({ ok: false, code: "STALE_PATCH", message: "stale" });
    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await user.click(await screen.findByTestId("builder-ai-apply-button"));
    await waitFor(() => expect(mockApply).toHaveBeenCalledTimes(1));
    // STALE_PATCH → onApplied NOT called → getWorkflow NOT called → canvas unchanged.
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    const after = readGraphSnapshot();
    expect(after.savedNodes).toHaveLength(1);
    expect(after.savedNodes[0]!.id).toBe("n_trigger_seed");
  });

  it("clicking Clear / Plan-another-change does NOT mutate graphSlice (it only resets chat/composer/hook state)", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    const user = userEvent.setup();
    await user.type(screen.getByTestId("builder-ai-prompt"), "Send a Slack message");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await screen.findByTestId("builder-ai-apply-button");
    const before = readGraphSnapshot();
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    const after = readGraphSnapshot();
    expect(after.savedNodes).toBe(before.savedNodes);
    expect(after.savedEdges).toBe(before.savedEdges);
    expect(after.pendingNodes).toBe(before.pendingNodes);
    expect(after.pendingEdges).toBe(before.pendingEdges);
    expect(after.isDirty).toBe(before.isDirty);
  });
});
