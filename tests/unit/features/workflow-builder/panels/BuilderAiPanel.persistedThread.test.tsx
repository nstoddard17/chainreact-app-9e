/**
 * Tests for the AI-23 persistent Builder Agent thread integration in
 * `features/workflow-builder/panels/BuilderAiPanel.tsx`.
 *
 * Covers:
 *   - Loading a persisted thread on mount (workflowId already hydrated).
 *   - Persisted assistant plan_result rendering as the read-only previous-turn
 *     summary (`builder-ai-plan-result-previous`) — no Apply button.
 *   - New session messages persisting via `appendBuilderAgentMessage` —
 *     user prompt + assistant plan_result both saved.
 *   - Clear conversation calling `clearBuilderAgentThread` AND wiping the
 *     local chat (back-compat with the AI-11B clear behavior).
 *   - Fail-open: a thread load / append failure does NOT block the live
 *     planner — the chat still renders, plan still completes.
 *   - No raw config / proposedPatch leaks into rendered output even from
 *     persisted history (the rehydrated message is a safe summary).
 *
 * AI-26 — adds:
 *   - StrictMode regression: persisted messages render after the simulated
 *     unmount / remount cycle that previously dropped them.
 *   - Non-blocking history-load-failed notice replaces the intro hint
 *     when getBuilderAgentThread rejects.
 *   - workflowId-change: switching to a different workflow loads its
 *     persisted thread.
 */
import { StrictMode } from "react";
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

const persistedUserMsg = {
  id: "p1",
  role: "user" as const,
  kind: "prompt" as const,
  content: "Post to Slack on new email",
  safePayload: {},
  createdAt: "2026-05-26T00:00:01Z",
};

const persistedAssistantPlanMsg = {
  id: "p2",
  role: "assistant" as const,
  kind: "plan_result" as const,
  content: "Add a Slack post after the email trigger",
  safePayload: {
    ok: true,
    intentSummary: "Add a Slack post after the email trigger",
    canApplyLater: true,
    preview: { riskLevel: "low", requiresConfirmation: false, changeCount: 1 },
  },
  createdAt: "2026-05-26T00:00:02Z",
};

const livePlanResult = {
  ok: true,
  intentSummary: "Add a Discord post",
  assumptions: [],
  requiredUserInput: [],
  unsupportedRequests: [],
  safetyNotes: [],
  proposedPatch: { patchId: "p-new", operations: [], summary: "s" },
  preview: {
    ok: true,
    riskLevel: "low",
    requiresConfirmation: false,
    affectedNodeIds: ["n1"],
    affectedEdgeIds: [],
    changes: [{ op: "addNode", description: "Adds Discord post" }],
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
  mockClearThread.mockResolvedValue({ ok: true, deletedCount: 2 });
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
});

describe("AI-23 — persisted thread load", () => {
  it("rehydrates persisted user + assistant messages on mount", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [persistedUserMsg, persistedAssistantPlanMsg],
    });
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(screen.getByText("Post to Slack on new email")).toBeInTheDocument(),
    );
    // The persisted plan_result renders as the read-only previous-turn
    // summary, NOT the full breakdown — and never an Apply button.
    await waitFor(() =>
      expect(
        screen.getByTestId("builder-ai-plan-result-previous"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("builder-ai-apply-button"),
    ).not.toBeInTheDocument();
  });

  it("renders a non-blocking history-load-failed notice when load rejects (AI-26)", async () => {
    mockGetThread.mockRejectedValueOnce(new Error("network down"));
    render(<BuilderAiPanel />);
    // The notice replaces the intro hint so the user can tell the
    // difference between "no history" and "couldn't load history."
    // Planning / applying are still possible — the composer renders.
    await waitFor(() =>
      expect(
        screen.getByTestId("builder-ai-history-load-failed"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("builder-ai-intro")).not.toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-composer")).toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-plan-button")).toBeInTheDocument();
  });

  it("does NOT render the load-failed notice on the happy path (AI-26)", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [],
    });
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-intro")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("builder-ai-history-load-failed"),
    ).not.toBeInTheDocument();
  });
});

describe("AI-26 — StrictMode regression (refresh-clears-chat fix)", () => {
  it("renders persisted messages under <StrictMode> after the simulated unmount/remount cycle", async () => {
    // PRE-AI-26: the panel's load effect set `loadedForWorkflowRef.current
    // = workflowId` BEFORE awaiting `getBuilderAgentThread`. Strict Mode
    // ran cleanup (cancelled=true) then re-ran the effect, which then
    // early-returned because the ref was already set — and the cancelled
    // first fetch never reached `setMessages`. Persisted chat disappeared
    // on every refresh in dev. After AI-26 the ref is assigned only AFTER
    // a successful commit, so the remount effect's fetch is the one that
    // wins.
    mockGetThread.mockResolvedValue({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [persistedUserMsg, persistedAssistantPlanMsg],
    });
    render(
      <StrictMode>
        <BuilderAiPanel />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(screen.getByText("Post to Slack on new email")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("builder-ai-plan-result-previous"),
      ).toBeInTheDocument(),
    );
  });

  it("does not double-commit persisted messages on the StrictMode cycle", async () => {
    // The late dedup check inside the async closure (`ref === workflowId`
    // after the await resolves) guarantees only one setMessages reaches
    // the list even if both StrictMode effect runs race to completion.
    mockGetThread.mockResolvedValue({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [persistedUserMsg],
    });
    render(
      <StrictMode>
        <BuilderAiPanel />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(screen.getByText("Post to Slack on new email")).toBeInTheDocument(),
    );
    // Exactly one matching user bubble — no duplicate from the second
    // StrictMode effect run.
    expect(screen.getAllByText("Post to Slack on new email")).toHaveLength(1);
  });

  it("loads the new workflow's persisted thread when workflowId changes", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [persistedUserMsg],
    });
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(screen.getByText("Post to Slack on new email")).toBeInTheDocument(),
    );
    // Switch the active workflow. The graphSlice transition rehydrates
    // the panel via the workflowId selector dep.
    const wf2UserMsg = {
      ...persistedUserMsg,
      id: "p1-wf2",
      content: "Send a Discord DM when a Stripe charge fails",
    };
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-2", workflowId: "wf-2", createdAt: "x", updatedAt: "x" },
      messages: [wf2UserMsg],
    });
    await act(async () => {
      useGraphSlice.getState().hydrate("wf-2", { nodes: [], edges: [] });
    });
    await waitFor(() =>
      expect(
        screen.getByText("Send a Discord DM when a Stripe charge fails"),
      ).toBeInTheDocument(),
    );
    // The previous workflow's message is no longer in the DOM (messages
    // were replaced by the new workflow's persisted thread).
    expect(
      screen.queryByText("Post to Slack on new email"),
    ).not.toBeInTheDocument();
    expect(mockGetThread).toHaveBeenCalledTimes(2);
    expect(mockGetThread).toHaveBeenLastCalledWith("wf-2");
  });

  it("resets a prior workflow's load-failed notice when switching workflows", async () => {
    mockGetThread.mockRejectedValueOnce(new Error("wf-1 load failed"));
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(
        screen.getByTestId("builder-ai-history-load-failed"),
      ).toBeInTheDocument(),
    );
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-2", workflowId: "wf-2", createdAt: "x", updatedAt: "x" },
      messages: [],
    });
    await act(async () => {
      useGraphSlice.getState().hydrate("wf-2", { nodes: [], edges: [] });
    });
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-intro")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("builder-ai-history-load-failed"),
    ).not.toBeInTheDocument();
  });
});

describe("AI-23 — new messages persist", () => {
  it("persists the user prompt + the assistant plan_result on submit", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [],
    });
    mockPlan.mockResolvedValueOnce(livePlanResult);

    render(<BuilderAiPanel />);
    await waitFor(() => expect(mockGetThread).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("builder-ai-prompt"),
      "Post to Discord on new email",
    );
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    await waitFor(() => expect(mockPlan).toHaveBeenCalled());
    // Two persistence calls: the user prompt + the assistant plan_result.
    await waitFor(() =>
      expect(mockAppendThreadMessage.mock.calls.length).toBeGreaterThanOrEqual(2),
    );

    const userCall = mockAppendThreadMessage.mock.calls.find(
      (c) => (c[1] as { role: string }).role === "user",
    );
    expect(userCall?.[1]).toMatchObject({
      role: "user",
      kind: "prompt",
      content: "Post to Discord on new email",
    });

    const assistantCall = mockAppendThreadMessage.mock.calls.find(
      (c) => (c[1] as { role: string }).role === "assistant",
    );
    expect(assistantCall?.[1]).toMatchObject({
      role: "assistant",
      kind: "plan_result",
    });
    // No raw proposedPatch / operations leaked into the safe payload sent
    // up by the client (server sanitizer re-applies the same allowlist).
    const sentPayload = (assistantCall?.[1] as { safePayload: Record<string, unknown> })
      .safePayload;
    expect(sentPayload.proposedPatch).toBeUndefined();
    expect(sentPayload.operations).toBeUndefined();
    expect(sentPayload.intentSummary).toBe("Add a Discord post");
  });

  it("still appends the user message + plan locally when persistence fails (fail-open)", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [],
    });
    mockPlan.mockResolvedValueOnce(livePlanResult);
    mockAppendThreadMessage.mockRejectedValue(new Error("persist-failed"));

    render(<BuilderAiPanel />);
    await waitFor(() => expect(mockGetThread).toHaveBeenCalled());
    const user = userEvent.setup();
    await user.type(screen.getByTestId("builder-ai-prompt"), "build it");
    await user.click(screen.getByTestId("builder-ai-plan-button"));

    // The plan UI still renders despite the persistence failure.
    await waitFor(() =>
      expect(screen.getByTestId("builder-ai-plan-result")).toBeInTheDocument(),
    );
  });
});

describe("AI-23 — clear conversation also clears persisted thread", () => {
  it("DELETEs the persisted thread when Clear is clicked", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [persistedUserMsg, persistedAssistantPlanMsg],
    });
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(screen.getByText("Post to Slack on new email")).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("builder-ai-clear-button"));

    await waitFor(() => expect(mockClearThread).toHaveBeenCalledWith("wf-1"));
    // Local chat is also reset.
    expect(
      screen.queryByText("Post to Slack on new email"),
    ).not.toBeInTheDocument();
  });

  it("does NOT block the local reset when the DELETE fails (fail-open)", async () => {
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [persistedUserMsg],
    });
    mockClearThread.mockRejectedValueOnce(new Error("clear-failed"));

    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(screen.getByText("Post to Slack on new email")).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("builder-ai-clear-button"));

    await waitFor(() =>
      expect(
        screen.queryByText("Post to Slack on new email"),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("AI-23 — no-leak from persisted history", () => {
  it("never renders raw proposedPatch / operations / config from safe_payload", async () => {
    // Even if a malformed server response somehow includes forbidden fields,
    // the rehydration path only reads allowlisted keys.
    mockGetThread.mockResolvedValueOnce({
      thread: { id: "thr-1", workflowId: "wf-1", createdAt: "x", updatedAt: "x" },
      messages: [
        {
          ...persistedAssistantPlanMsg,
          safePayload: {
            ...persistedAssistantPlanMsg.safePayload,
            // SHOULD never have made it through the server sanitizer — but
            // even if it did, the client rehydrator ignores these.
            proposedPatch: { patchId: "leak", operations: [{ op: "addNode" }] },
            operations: [{ op: "addNode" }],
            config: { authorization: "Bearer leak-token" },
          },
        },
      ],
    });
    render(<BuilderAiPanel />);
    await waitFor(() =>
      expect(
        screen.getByTestId("builder-ai-plan-result-previous"),
      ).toBeInTheDocument(),
    );
    const root = screen.getByTestId("builder-ai-panel");
    expect(root.textContent).not.toMatch(/proposedPatch|operations|Bearer leak-token|addNode/);
  });
});
