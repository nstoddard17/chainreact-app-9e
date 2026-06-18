/**
 * Regression tests — the React Agent rail must NEVER mutate the workflow
 * graph except via a successful Apply (Slice 4.AI-25, follow-up to
 * Marcus's 2026-05-27 smoke).
 *
 * Live observation: Marcus deleted Manual Trigger → Slack locally, opened
 * the React Agent, prompted, and the deleted nodes came back. The AI
 * call returned RATE_LIMITED — so it couldn't have applied anything.
 * Marcus confirmed "It doesn't do it when I save", which pinned the
 * cause to saved-draft rehydration on page refresh (NOT a bug in the AI
 * plumbing). These tests guarantee no React-Agent-rail path other than
 * `onApplied` calls `graphSlice.hydrate()`:
 *
 *   - Initial mount on a deleted-but-unsaved canvas: no hydrate fires.
 *   - Plan (success / rate-limited / parse-failed / transport-failure):
 *     graph unchanged.
 *   - Persisted-thread load: graph unchanged.
 *   - Follow-up plan: graph unchanged.
 *   - Required-input control selection: graph unchanged.
 *   - Clear conversation: graph unchanged.
 *   - SUCCESSFUL Apply: graph IS hydrated (positive control).
 *
 * The mock for `getWorkflow` is spied across the suite so we can also
 * assert that the API client is never called outside `onApplied`.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
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

// The exact "Manual Trigger → Slack channel-message" shape Marcus had.
const MANUAL_PLUS_SLACK = {
  nodes: [
    {
      id: "trig-1",
      kind: "trigger" as const,
      provider: "native",
      type: "manual.run",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "act-1",
      kind: "action" as const,
      provider: "slack",
      type: "send_channel_message",
      config: {},
      position: { x: 100, y: 0 },
    },
  ],
  edges: [{ id: "e-1", from: "trig-1", to: "act-1" }],
};

const planNeedsInput = {
  ok: true,
  intentSummary: "Add a Gmail-triggered Slack post",
  assumptions: [],
  requiredUserInput: [
    {
      label: "Which Slack channel?",
      kind: "config_value",
    },
  ],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p1", operations: [], summary: "needs info" },
  preview: {
    ok: true,
    riskLevel: "low",
    requiresConfirmation: false,
    affectedNodeIds: [],
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
  ...planNeedsInput,
  requiredUserInput: [],
  canApplyLater: true,
  blockedReason: undefined,
};

const planRateLimited = {
  ok: false as const,
  code: "MODEL_FAILED",
  message: "The model did not return a plan (RATE_LIMITED).",
  errors: [{ stage: "model", code: "RATE_LIMITED", message: "rate limited" }],
  model: {
    modelId: "claude-sonnet-4-6",
    tier: "strong" as const,
    feature: "creation" as const,
    finishReason: "stop" as const,
  },
};

const planParseFailed = {
  ok: false as const,
  code: "PARSE_FAILED",
  message: "The model response could not be parsed into a valid plan.",
  errors: [{ stage: "parse", code: "INVALID_JSON", message: "bad json" }],
  model: {
    modelId: "claude-sonnet-4-6",
    tier: "strong" as const,
    feature: "creation" as const,
    finishReason: "stop" as const,
  },
};

function hydrateWithManualAndSlack() {
  useGraphSlice.getState().hydrate("wf-1", MANUAL_PLUS_SLACK);
}

function snapshotGraph() {
  const s = useGraphSlice.getState();
  return {
    pendingNodes: s.pendingNodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
    })),
    pendingEdges: s.pendingEdges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
    savedNodes: s.savedNodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
    })),
    savedEdges: s.savedEdges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
    isDirty: s.isDirty,
  };
}

async function plan(prompt: string) {
  const user = userEvent.setup();
  await user.type(screen.getByTestId("builder-ai-prompt"), prompt);
  await user.click(screen.getByTestId("builder-ai-plan-button"));
  return user;
}

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
  // Start every test on an EMPTY canvas — replicating Marcus's post-delete
  // state — UNLESS the test explicitly hydrates with Manual + Slack.
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

describe("AI-25 — initial mount + persisted-thread load do not hydrate the graph", () => {
  it("mounting the panel does NOT touch the graph (no getWorkflow call)", async () => {
    hydrateWithManualAndSlack();
    // Make the canvas dirty by deleting one node so we have a clear "before"
    // shape we can compare against — Marcus's exact scenario.
    act(() => {
      useGraphSlice.getState().deleteNodeAndRewire("act-1");
      useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    });
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    await waitFor(() => expect(mockGetThread).toHaveBeenCalled());
    // Persisted-thread load completed. graphSlice must be UNCHANGED.
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("persisted-thread load with messages does NOT touch the graph", async () => {
    hydrateWithManualAndSlack();
    act(() => {
      useGraphSlice.getState().deleteNodeAndRewire("act-1");
      useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    });
    const before = snapshotGraph();
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [
        {
          id: "m1",
          role: "user",
          kind: "prompt",
          content: "earlier prompt",
          safePayload: {},
          createdAt: "2026-05-20T00:00:00Z",
        },
        {
          id: "m2",
          role: "assistant",
          kind: "plan_result",
          content: "Earlier plan",
          safePayload: { ok: true, intentSummary: "Earlier plan", canApplyLater: false },
          createdAt: "2026-05-20T00:00:01Z",
        },
      ],
    });
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(screen.getByText("earlier prompt")).toBeInTheDocument(),
    );
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});

describe("AI-25 — plan() does not mutate the graph regardless of result shape", () => {
  it("plan SUCCESS (needs-input) — graph unchanged, no getWorkflow call", async () => {
    mockPlan.mockResolvedValueOnce(planNeedsInput);
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-needs-input")).toBeInTheDocument(),
    );
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("plan SUCCESS (apply-ready) — graph unchanged until Apply", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-apply-button")).toBeInTheDocument(),
    );
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("plan RATE_LIMITED (MODEL_FAILED via 429) — graph unchanged, no getWorkflow call", async () => {
    mockPlan.mockResolvedValueOnce(planRateLimited);
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-plan-failure")).toBeInTheDocument(),
    );
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
    // RATE_LIMITED detail line surfaces the diagnostic code without leaking
    // raw provider error text.
    expect(screen.getByTestId("builder-ai-plan-failure-detail")).toHaveTextContent(
      /model.*\/ RATE_LIMITED/,
    );
  });

  it("plan PARSE_FAILED — graph unchanged, no getWorkflow call", async () => {
    mockPlan.mockResolvedValueOnce(planParseFailed);
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-plan-failure")).toBeInTheDocument(),
    );
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("plan TRANSPORT failure (planWorkflow throws) — graph unchanged", async () => {
    mockPlan.mockRejectedValueOnce(new Error("network down"));
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});

describe("AI-25 — follow-up + required-input selection do not mutate the graph", () => {
  it("follow-up plan returning needs-input — graph unchanged", async () => {
    mockPlan.mockResolvedValueOnce(planNeedsInput);
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-needs-input")).toBeInTheDocument(),
    );
    // Follow-up turn — answer with more text, still needs info.
    mockPlan.mockResolvedValueOnce(planNeedsInput);
    await user.type(screen.getByTestId("builder-ai-prompt"), "Use #general");
    await user.click(screen.getByTestId("builder-ai-plan-button"));
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });

  it("Clear conversation — graph unchanged", async () => {
    mockPlan.mockResolvedValueOnce(planNeedsInput);
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    // AUTOROUTE CS-3 — a plan-shaped prompt so it routes to the planner (this test
    // pins graph-immutability on Clear; the prompt content is incidental).
    const user = await plan("Add a first step");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    // Clear conversation button only renders when messages exist.
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    await waitFor(() => expect(mockClearThread).toHaveBeenCalled());
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});

describe("AI-25 — only successful Apply rehydrates the graph (positive control)", () => {
  it("apply SUCCESS — getWorkflow called once, graph hydrated from the apply-side draft", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({
      ok: true,
      workflowId: "wf-1",
      appliedPatchId: "p1",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
      updatedAt: "2026-05-27T00:01:00Z",
      summaryText: "Added 1 action.",
    });
    mockGetWorkflow.mockResolvedValueOnce({
      id: "wf-1",
      name: "x",
      state: "draft",
      disabledReason: null,
      disabledContext: null,
      activeRevisionId: null,
      draftDefinition: {
        nodes: [
          {
            id: "new-trig",
            kind: "trigger",
            provider: "gmail",
            type: "new_email",
            config: {},
            position: { x: 0, y: 0 },
          },
        ],
        edges: [],
      },
      deletedAt: null,
      createdAt: "x",
      updatedAt: "y",
    });
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-apply-button")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("builder-ai-apply-button"));
    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    await waitFor(() => expect(mockGetWorkflow).toHaveBeenCalledTimes(1));
    // Graph IS now hydrated from the apply-side draft.
    const after = useGraphSlice.getState();
    expect(after.pendingNodes.map((n) => n.id)).toEqual(["new-trig"]);
    expect(after.savedNodes.map((n) => n.id)).toEqual(["new-trig"]);
    expect(after.isDirty).toBe(false);
  });

  it("apply FAILURE — graph unchanged, no getWorkflow call", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    mockApply.mockResolvedValueOnce({
      ok: false,
      code: "STALE_PATCH",
      message: "Workflow changed",
    });
    const before = snapshotGraph();
    render(<BuilderAiPanel />);
    const user = await plan("Send a Slack message when I get an email");
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-apply-button")).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId("builder-ai-apply-button"));
    await waitFor(() => expect(mockApply).toHaveBeenCalled());
    expect(snapshotGraph()).toEqual(before);
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});
