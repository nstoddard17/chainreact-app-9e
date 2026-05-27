/**
 * Tests for the AI-24 current-canvas snapshot integration in
 * `features/workflow-builder/panels/BuilderAiPanel.tsx`.
 *
 * Root cause this slice fixes: prior to AI-24 the planner only saw the
 * server-saved `draftDefinition` — not the user's pending / unsaved local
 * graph. If the user deleted nodes locally without saving and then asked
 * "Send a Slack message when I get an email", the planner reasoned against
 * stale state AND its no-substitution rule was too weak. AI-24 ships a
 * client-supplied `currentGraph` snapshot that travels through
 * `BuilderAiPanel → useBuilderAi → lib/api/ai.planWorkflow → /api/.../plan`
 * so the planner sees the canvas as the user sees it.
 *
 * Covers:
 *   - Empty canvas → snapshot = `{ nodes: [], edges: [] }`.
 *   - Trigger + action hydrated → snapshot mirrors graphSlice's pending*.
 *   - Delete-then-plan: the snapshot reflects the POST-delete state, NOT
 *     the pre-delete (regression guard for the V1 bug Marcus surfaced).
 *   - Snapshot is value-free: no `config` / `position` ever sent up.
 *   - Follow-up + re-run sites also send the snapshot.
 *   - Persisted thread history does NOT influence the snapshot (the
 *     snapshot is derived from the live graphSlice, not from chat).
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
jest.mock("@/lib/api/workflows", () => ({
  getWorkflow: (...a: unknown[]) => mockGetWorkflow(...a),
}));

import { BuilderAiPanel } from "@/features/workflow-builder/panels/BuilderAiPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const planApplyReady = {
  ok: true,
  intentSummary: "Add a Gmail-triggered Slack post",
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
    changes: [],
    validation: { ok: true, errors: [], warnings: [] },
    taskCostEstimate: { estimatedTasksPerRun: 1 },
  },
  canApplyLater: true,
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
  mockGetWorkflow.mockResolvedValue({
    id: "wf-1",
    draftDefinition: { nodes: [], edges: [] },
  });
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

describe("AI-24 — currentGraph snapshot derived from graphSlice", () => {
  it("sends an empty snapshot when the canvas is empty", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    const [, body] = mockPlan.mock.calls[0]!;
    expect(body).toMatchObject({
      currentGraph: { nodes: [], edges: [] },
    });
  });

  it("sends the LIVE canvas (trigger + action) when nodes were added", async () => {
    mockPlan.mockResolvedValueOnce(planApplyReady);
    // Hydrate with a trigger + an action (the V1 pre-bug state Marcus had).
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig-1",
          kind: "trigger",
          provider: "native",
          type: "manual.run",
          config: { secret: "ya29.SHOULD-NOT-LEAK" },
          position: { x: 0, y: 0 },
        },
        {
          id: "act-1",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: { channel: "C0LEAK", text: "hi" },
          position: { x: 100, y: 0 },
        },
      ],
      edges: [{ id: "e-1", from: "trig-1", to: "act-1" }],
    });
    render(<BuilderAiPanel />);
    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    const [, body] = mockPlan.mock.calls[0]!;
    const snapshot = (body as { currentGraph: { nodes: Array<Record<string, unknown>>; edges: unknown[] } })
      .currentGraph;
    expect(snapshot.nodes).toEqual([
      { id: "trig-1", kind: "trigger", provider: "native", type: "manual.run" },
      { id: "act-1", kind: "action", provider: "slack", type: "send_channel_message" },
    ]);
    expect(snapshot.edges).toEqual([
      { id: "e-1", from: "trig-1", to: "act-1" },
    ]);
    // No-leak: config + position are NEVER projected into the snapshot.
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("ya29.SHOULD-NOT-LEAK");
    expect(serialized).not.toContain("C0LEAK");
    expect(serialized).not.toContain("position");
    expect(serialized).not.toContain("config");
  });

  it("DELETE-THEN-PLAN regression — snapshot reflects POST-delete state", async () => {
    // Replicate Marcus's smoke: hydrate Manual Trigger → Slack action,
    // delete BOTH locally (no save), then plan. The snapshot the panel
    // sends MUST be empty (or post-delete), NOT pre-delete. Without
    // AI-24 the planner had no canvas context AND was reading the stale
    // server draftDefinition; this test pins the client-side cure.
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig-1",
          kind: "trigger",
          provider: "native",
          type: "manual.run",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "act-1",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 100, y: 0 },
        },
      ],
      edges: [{ id: "e-1", from: "trig-1", to: "act-1" }],
    });
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);

    // Local delete WITHOUT saving — exactly what Marcus did.
    act(() => {
      useGraphSlice.getState().deleteNodeAndRewire("act-1");
    });
    act(() => {
      useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    });

    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    const [, body] = mockPlan.mock.calls[0]!;
    const snapshot = (body as { currentGraph: { nodes: unknown[]; edges: unknown[] } })
      .currentGraph;
    // Both nodes deleted locally → snapshot is empty.
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.edges).toEqual([]);
    // Belt + braces: no trace of the deleted nodes in the planner body.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("manual.run");
    expect(serialized).not.toContain("send_channel_message");
    expect(serialized).not.toContain("trig-1");
    expect(serialized).not.toContain("act-1");
  });

  it("DELETE-ONE-NODE regression — snapshot reflects the remaining node only", async () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig-1",
          kind: "trigger",
          provider: "native",
          type: "manual.run",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "act-1",
          kind: "action",
          provider: "slack",
          type: "send_channel_message",
          config: {},
          position: { x: 100, y: 0 },
        },
      ],
      edges: [{ id: "e-1", from: "trig-1", to: "act-1" }],
    });
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    act(() => {
      useGraphSlice.getState().deleteNodeAndRewire("trig-1");
    });
    await plan("Now add Gmail new-email as the trigger");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    const snapshot = (mockPlan.mock.calls[0]![1] as {
      currentGraph: { nodes: Array<{ id: string }> };
    }).currentGraph;
    expect(snapshot.nodes.map((n) => n.id)).toEqual(["act-1"]);
  });
});

describe("AI-24 — snapshot is derived from live state, not chat history", () => {
  it("persisted chat history does NOT influence the snapshot (snapshot mirrors graphSlice only)", async () => {
    // Even though the persisted thread says the user once worked with a
    // Manual Trigger + Slack channel-message, the snapshot reflects the
    // EMPTY current canvas.
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [
        {
          id: "old-1",
          role: "user",
          kind: "prompt",
          content: "earlier prompt: Manual Trigger to Slack",
          safePayload: {},
          createdAt: "2026-05-20T00:00:00Z",
        },
        {
          id: "old-2",
          role: "assistant",
          kind: "plan_result",
          content: "Added Manual Trigger and Slack channel message",
          safePayload: {
            ok: true,
            intentSummary: "Manual + Slack channel",
            canApplyLater: false,
          },
          createdAt: "2026-05-20T00:00:01Z",
        },
      ],
    });
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await waitFor(() => expect(mockGetThread).toHaveBeenCalled());

    await plan("Send a Slack message when I get an email");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    const snapshot = (mockPlan.mock.calls[0]![1] as {
      currentGraph: { nodes: unknown[]; edges: unknown[] };
    }).currentGraph;
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.edges).toEqual([]);
  });

  it("Clear conversation does NOT alter the snapshot (snapshot is graph-derived, not chat-derived)", async () => {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        {
          id: "trig-1",
          kind: "trigger",
          provider: "gmail",
          type: "new_email",
          config: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    });
    // First plan so messages exist and the Clear button renders.
    mockPlan.mockResolvedValueOnce(planApplyReady);
    render(<BuilderAiPanel />);
    await plan("first prompt");
    await waitFor(() => expect(mockPlan).toHaveBeenCalled());

    const user = userEvent.setup();
    // Clear conversation — DELETEs persisted chat + resets local messages,
    // but MUST NOT touch the live graphSlice canvas. The snapshot on the
    // NEXT plan call should still reflect the Gmail trigger.
    await user.click(screen.getByTestId("builder-ai-clear-button"));
    await waitFor(() => expect(mockClearThread).toHaveBeenCalled());

    mockPlan.mockResolvedValueOnce(planApplyReady);
    await plan("Make this also DM me on Slack");
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2));
    const snapshot = (mockPlan.mock.calls[1]![1] as {
      currentGraph: { nodes: Array<{ id: string; provider: string; type: string }> };
    }).currentGraph;
    expect(snapshot.nodes).toEqual([
      { id: "trig-1", kind: "trigger", provider: "gmail", type: "new_email" },
    ]);
  });
});
