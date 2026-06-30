/**
 * AGENT-CHANGE-HISTORY-1 — useAgentChangeEmission (emit seams + undo detection).
 *
 * Business rules under test:
 *   - emitPreviewCreated records a preview_created event (with counts) through the
 *     typed client API — never a service/repository.
 *   - Undoing an agent apply records an `undone` event: after an apply the hook
 *     watches the graph-history depth and, when the next undo reverts exactly that
 *     apply (future grows, past drops back below the apply mark), it records undone.
 *   - A LATER edit landing on top of the apply forgets it — a subsequent undo
 *     (which reverts that later edit, not the apply) records NOTHING.
 *   - Disabled (logged-out builder) → every emit is inert (no client API calls).
 *
 * The typed client API is mocked (UI/hook contract per testing-strategy); the REAL
 * graph slice drives the undo detection so the subscription logic is exercised.
 */

const mockList = jest.fn();
const mockRecord = jest.fn();
jest.mock("@/lib/api/agentChangeHistory", () => ({
  listAgentChangeHistory: (...a: unknown[]) => mockList(...a),
  recordAgentChange: (...a: unknown[]) => mockRecord(...a),
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { useAgentChangeEmission } from "@/features/workflow-builder/hooks/useAgentChangeEmission";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const SNAP = { nodes: [], edges: [] } as const;

type RecordCall = [string, { status: string; agentChangeId: string; [k: string]: unknown }];

function recordedWithStatus(status: string): RecordCall[1] | undefined {
  const call = (mockRecord.mock.calls as RecordCall[]).find(([, body]) => body.status === status);
  return call?.[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([]);
  mockRecord.mockResolvedValue({ id: "row", agentChangeId: "x", status: "ok" });
  useGraphSlice.setState({ past: [], future: [] });
});

describe("emitPreviewCreated", () => {
  it("records a preview_created event with counts via the typed client API", async () => {
    const { result } = renderHook(() => useAgentChangeEmission("wf-1", { enabled: true }));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.emitPreviewCreated({
        agentChangeId: "ch-3",
        prompt: "do x",
        title: "1 node added",
        summary: "s",
        counts: {
          addedNodeCount: 1,
          removedNodeCount: 0,
          changedNodeCount: 0,
          changedConfigCount: 0,
          setupIssueCount: 0,
        },
      });
    });

    const body = recordedWithStatus("preview_created");
    expect(mockRecord.mock.calls[0]?.[0]).toBe("wf-1");
    expect(body).toMatchObject({
      agentChangeId: "ch-3",
      status: "preview_created",
      prompt: "do x",
      addedNodeCount: 1,
    });
  });
});

describe("undo detection", () => {
  it("records `undone` when the apply is the next undo and is undone", async () => {
    const { result } = renderHook(() => useAgentChangeEmission("wf-1", { enabled: true }));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    // One applied edit sits on the undo stack.
    await act(async () => {
      useGraphSlice.setState({ past: [SNAP], future: [] });
    });
    await act(async () => {
      result.current.emitApplied({ agentChangeId: "ch-1" });
    });
    // Undo: the apply snapshot moves from past → future.
    await act(async () => {
      useGraphSlice.setState({ past: [], future: [SNAP] });
    });

    const undone = recordedWithStatus("undone");
    expect(undone).toMatchObject({ agentChangeId: "ch-1", status: "undone" });
  });

  it("does NOT record `undone` when a later edit landed on top of the apply", async () => {
    const { result } = renderHook(() => useAgentChangeEmission("wf-1", { enabled: true }));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    await act(async () => {
      useGraphSlice.setState({ past: [SNAP], future: [] });
    });
    await act(async () => {
      result.current.emitApplied({ agentChangeId: "ch-2" });
    });
    // A later manual edit grows the past beyond the apply mark → the apply is no longer the next undo.
    await act(async () => {
      useGraphSlice.setState({ past: [SNAP, SNAP], future: [] });
    });
    // Undo of THAT later edit — must not attribute it to the agent apply.
    await act(async () => {
      useGraphSlice.setState({ past: [SNAP], future: [SNAP] });
    });

    expect(recordedWithStatus("undone")).toBeUndefined();
  });
});

describe("disabled (logged-out builder)", () => {
  it("makes every emit inert — no client API calls", async () => {
    const { result } = renderHook(() => useAgentChangeEmission("wf-1", { enabled: false }));
    await act(async () => {
      result.current.emitApplied({ agentChangeId: "ch" });
      result.current.emitPreviewCreated({
        agentChangeId: "ch",
        counts: {
          addedNodeCount: 0,
          removedNodeCount: 0,
          changedNodeCount: 0,
          changedConfigCount: 0,
          setupIssueCount: 0,
        },
      });
    });
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });
});
