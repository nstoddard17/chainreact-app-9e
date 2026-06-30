/**
 * CHECKPOINTS-1 — useWorkflowCheckpoints hook.
 *
 * Business rules under test:
 *   - Loads recent checkpoints once on mount (StrictMode-safe) via the typed client API.
 *   - createReactAgentCheckpoint sends the captured PRE-change definition with the fixed
 *     source `react_agent` + name "Before React Agent change" (this is the "checkpoint before
 *     mutation" payload), and optimistically prepends the result.
 *   - A restore failure resolves the error into `restoreError` (and rethrows so the caller can react).
 *   - The hook is inert when disabled (logged-out builder) — no client API calls.
 */

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockRestore = jest.fn();
jest.mock("@/lib/api/workflowCheckpoints", () => ({
  listWorkflowCheckpoints: (...a: unknown[]) => mockList(...a),
  createWorkflowCheckpoint: (...a: unknown[]) => mockCreate(...a),
  restoreWorkflowCheckpoint: (...a: unknown[]) => mockRestore(...a),
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { useWorkflowCheckpoints } from "@/features/workflow-builder/hooks/useWorkflowCheckpoints";
import { WorkflowApiError } from "@/lib/api/workflows";
import type { WorkflowCheckpoint } from "@/contracts/workflowCheckpoint";

const PRE_CHANGE = {
  nodes: [
    { id: "t1", kind: "trigger" as const, provider: "slack", type: "new_message", config: {}, position: { x: 0, y: 0 } },
  ],
  edges: [],
};

const EXISTING: WorkflowCheckpoint = {
  id: "cp-0", workflowId: "wf-1", source: "react_agent", name: "Before React Agent change",
  prompt: "older", summary: null, createdByUserId: "user-1", createdAt: "2026-07-15T00:30:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([EXISTING]);
});

describe("useWorkflowCheckpoints", () => {
  it("loads recent checkpoints once on mount via the typed client API", async () => {
    const { result } = renderHook(() => useWorkflowCheckpoints("wf-1", { enabled: true }));
    await waitFor(() => expect(result.current.checkpoints).toHaveLength(1));
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith("wf-1");
  });

  it("does not fetch when disabled (logged-out builder)", async () => {
    renderHook(() => useWorkflowCheckpoints("wf-1", { enabled: false }));
    await Promise.resolve();
    expect(mockList).not.toHaveBeenCalled();
  });

  it("createReactAgentCheckpoint sends the pre-change definition with source react_agent and the fixed name, then prepends it", async () => {
    const created: WorkflowCheckpoint = {
      id: "cp-1", workflowId: "wf-1", source: "react_agent", name: "Before React Agent change",
      prompt: "change slack to gmail", summary: "Removed Slack; Added Gmail.",
      createdByUserId: "user-1", createdAt: "2026-07-15T01:00:00Z",
    };
    mockCreate.mockResolvedValue(created);
    const { result } = renderHook(() => useWorkflowCheckpoints("wf-1", { enabled: true }));
    await waitFor(() => expect(result.current.checkpoints).toHaveLength(1));

    await act(async () => {
      await result.current.createReactAgentCheckpoint({
        definition: PRE_CHANGE,
        prompt: "change slack to gmail",
        summary: "Removed Slack; Added Gmail.",
      });
    });

    expect(mockCreate).toHaveBeenCalledWith("wf-1", {
      definition: PRE_CHANGE,
      source: "react_agent",
      name: "Before React Agent change",
      prompt: "change slack to gmail",
      summary: "Removed Slack; Added Gmail.",
    });
    // Optimistically surfaced at the top of the list.
    expect(result.current.checkpoints[0]?.id).toBe("cp-1");
    expect(result.current.checkpoints[1]?.id).toBe("cp-0");
  });

  it("resolves a restore failure into restoreError and rethrows", async () => {
    mockRestore.mockRejectedValue(new WorkflowApiError("Checkpoint not found.", "WORKFLOW_NOT_FOUND", 404));
    const { result } = renderHook(() => useWorkflowCheckpoints("wf-1", { enabled: true }));
    await waitFor(() => expect(result.current.checkpoints).toHaveLength(1));

    await act(async () => {
      await expect(result.current.restore("cp-9")).rejects.toBeInstanceOf(WorkflowApiError);
    });
    expect(result.current.restoreError).toBe("Checkpoint not found.");
  });
});
