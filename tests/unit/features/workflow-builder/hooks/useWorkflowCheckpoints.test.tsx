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

  it("on a 404 (checkpoint gone) removes the stale row and shows a friendly 'no longer available' message", async () => {
    // The server returns 404 CHECKPOINT_NOT_FOUND; the typed client maps any 404 to WORKFLOW_NOT_FOUND.
    mockRestore.mockRejectedValue(new WorkflowApiError("Checkpoint not found.", "WORKFLOW_NOT_FOUND", 404));
    const { result } = renderHook(() => useWorkflowCheckpoints("wf-1", { enabled: true }));
    await waitFor(() => expect(result.current.checkpoints).toHaveLength(1));

    await act(async () => {
      // Restore the row that IS in the list so we can prove it gets removed.
      await expect(result.current.restore(EXISTING.id)).rejects.toBeInstanceOf(WorkflowApiError);
    });
    // Stale control disappears, and the reason is explained — no raw 404 wording.
    expect(result.current.checkpoints).toHaveLength(0);
    expect(result.current.restoreError).toBe("This checkpoint is no longer available.");
  });

  it("on a non-404 failure keeps the row and surfaces the server-provided friendly message", async () => {
    mockRestore.mockRejectedValue(
      new WorkflowApiError("Couldn't restore this checkpoint. Refresh and try again.", "SERVER_ERROR", 500),
    );
    const { result } = renderHook(() => useWorkflowCheckpoints("wf-1", { enabled: true }));
    await waitFor(() => expect(result.current.checkpoints).toHaveLength(1));

    await act(async () => {
      await expect(result.current.restore(EXISTING.id)).rejects.toBeInstanceOf(WorkflowApiError);
    });
    // The row stays (restore might succeed on retry); the friendly server message is shown.
    expect(result.current.checkpoints).toHaveLength(1);
    expect(result.current.checkpoints[0]?.id).toBe(EXISTING.id);
    expect(result.current.restoreError).toBe("Couldn't restore this checkpoint. Refresh and try again.");
  });
});
