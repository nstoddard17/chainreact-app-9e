/**
 * Tests for features/workflow-builder/hooks/useCanvasNodeDeletion
 *
 * Drives the canvas keyboard-delete state machine without spinning up
 * React Flow. The hook owns the pendingDelete state + the
 * handleBeforeDelete / handleConfirm / handleCancel callbacks.
 *
 * Covered:
 *   - edges-only intent → returns true (proceed)
 *   - multi-select → returns false + sets multi pendingDelete
 *   - single linear → returns false + sets single pendingDelete with rewire preview
 *   - single multi-edge router → returns false + sets single pendingDelete with blocked preview
 *   - handleConfirm on single → calls deleteNodeAndRewire + drops draft + clears state
 *   - handleConfirm on multi → does nothing destructive; just clears state
 *   - handleCancel → clears state without mutating graph
 *   - keyboard delete no longer touches removeNode (counter-example check)
 *   - drops configSlice draft AND clears activeNodeId on successful delete
 */
import { act, renderHook } from "@testing-library/react";
import { useCanvasNodeDeletion } from "@/features/workflow-builder/hooks/useCanvasNodeDeletion";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";

function hydrateChainABC(): void {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", {
    nodes: [
      {
        id: "a",
        kind: "trigger",
        provider: "slack",
        type: "slack.message",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "b",
        kind: "action",
        provider: "native",
        type: "noop",
        config: {},
        position: { x: 100, y: 100 },
      },
      {
        id: "c",
        kind: "action",
        provider: "native",
        type: "noop",
        config: {},
        position: { x: 200, y: 200 },
      },
    ],
    edges: [
      { id: "e-a-b", from: "a", to: "b" },
      { id: "e-b-c", from: "b", to: "c" },
    ],
  });
}

function hydrateRouter(): void {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", {
    nodes: [
      {
        id: "trig",
        kind: "trigger",
        provider: "slack",
        type: "slack.message",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "router",
        kind: "action",
        provider: "native",
        type: "native:router",
        config: {},
        position: { x: 0, y: 100 },
      },
      {
        id: "x",
        kind: "action",
        provider: "native",
        type: "noop",
        config: {},
        position: { x: -100, y: 200 },
      },
      {
        id: "y",
        kind: "action",
        provider: "native",
        type: "noop",
        config: {},
        position: { x: 100, y: 200 },
      },
    ],
    edges: [
      { id: "e-trig-router", from: "trig", to: "router" },
      { id: "e-router-x", from: "router", to: "x", label: "left" },
      { id: "e-router-y", from: "router", to: "y", label: "right" },
    ],
  });
}

function flowNode(id: string): FlowNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
  };
}

function flowEdge(id: string, from: string, to: string): FlowEdge {
  return { id, source: from, target: to };
}

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("useCanvasNodeDeletion — handleBeforeDelete classification", () => {
  it("returns true (proceed) for edges-only deletion intent", async () => {
    hydrateChainABC();
    const { result } = renderHook(() => useCanvasNodeDeletion());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleBeforeDelete({
        nodes: [],
        edges: [flowEdge("e-a-b", "a", "b")],
      });
    });
    expect(outcome).toBe(true);
    expect(result.current.pendingDelete).toBeNull();
  });

  it("returns false + multi pendingDelete when 2+ nodes are selected", async () => {
    hydrateChainABC();
    const { result } = renderHook(() => useCanvasNodeDeletion());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleBeforeDelete({
        nodes: [flowNode("a"), flowNode("b")],
        edges: [],
      });
    });
    expect(outcome).toBe(false);
    expect(result.current.pendingDelete).toEqual({ kind: "multi", count: 2 });
  });

  it("returns false + single pendingDelete with rewire preview for a linear middle node", async () => {
    hydrateChainABC();
    const { result } = renderHook(() => useCanvasNodeDeletion());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleBeforeDelete({
        nodes: [flowNode("b")],
        edges: [],
      });
    });
    expect(outcome).toBe(false);
    const pending = result.current.pendingDelete;
    expect(pending?.kind).toBe("single");
    if (pending?.kind !== "single") return;
    expect(pending.nodeId).toBe("b");
    expect(pending.preview.ok).toBe(true);
    if (!pending.preview.ok) return;
    expect(pending.preview.rewiredEdgeId).not.toBeNull();
  });

  it("returns false + single pendingDelete with blocked preview for a router-style node", async () => {
    hydrateRouter();
    const { result } = renderHook(() => useCanvasNodeDeletion());
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleBeforeDelete({
        nodes: [flowNode("router")],
        edges: [],
      });
    });
    expect(outcome).toBe(false);
    const pending = result.current.pendingDelete;
    expect(pending?.kind).toBe("single");
    if (pending?.kind !== "single") return;
    expect(pending.preview.ok).toBe(false);
    if (pending.preview.ok) return;
    expect(pending.preview.reason).toBe("cannot_rewire_multi_edge");
  });
});

describe("useCanvasNodeDeletion — handleConfirm", () => {
  it("calls deleteNodeAndRewire + drops draft + clears state on single confirm", async () => {
    hydrateChainABC();
    // Pre-open node B's config draft so we can verify the drop.
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: "b", initialValues: { hello: "world" } });
    });
    expect(useConfigSlice.getState().drafts.b).toBeDefined();
    expect(useConfigSlice.getState().activeNodeId).toBe("b");

    const { result } = renderHook(() => useCanvasNodeDeletion());
    await act(async () => {
      await result.current.handleBeforeDelete({
        nodes: [flowNode("b")],
        edges: [],
      });
    });
    act(() => {
      result.current.handleConfirm();
    });

    expect(result.current.pendingDelete).toBeNull();
    const graph = useGraphSlice.getState();
    expect(graph.pendingNodes.map((n) => n.id).sort()).toEqual(["a", "c"]);
    expect(graph.pendingEdges).toHaveLength(1);
    expect(graph.pendingEdges[0]).toMatchObject({ from: "a", to: "c" });
    expect(graph.isDirty).toBe(true);
    expect(useConfigSlice.getState().drafts.b).toBeUndefined();
    expect(useConfigSlice.getState().activeNodeId).toBeNull();
  });

  it("multi confirm is a no-op for the graph (just clears state)", async () => {
    hydrateChainABC();
    const beforeNodes = useGraphSlice.getState().pendingNodes;
    const beforeEdges = useGraphSlice.getState().pendingEdges;
    const { result } = renderHook(() => useCanvasNodeDeletion());
    await act(async () => {
      await result.current.handleBeforeDelete({
        nodes: [flowNode("a"), flowNode("b")],
        edges: [],
      });
    });
    expect(result.current.pendingDelete?.kind).toBe("multi");
    act(() => {
      result.current.handleConfirm();
    });
    expect(result.current.pendingDelete).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toBe(beforeNodes);
    expect(useGraphSlice.getState().pendingEdges).toBe(beforeEdges);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("blocked single confirm does NOT mutate the graph (deleteNodeAndRewire returns ok:false)", async () => {
    hydrateRouter();
    const beforeNodes = useGraphSlice.getState().pendingNodes;
    const beforeEdges = useGraphSlice.getState().pendingEdges;
    const { result } = renderHook(() => useCanvasNodeDeletion());
    await act(async () => {
      await result.current.handleBeforeDelete({
        nodes: [flowNode("router")],
        edges: [],
      });
    });
    act(() => {
      result.current.handleConfirm();
    });
    expect(result.current.pendingDelete).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toBe(beforeNodes);
    expect(useGraphSlice.getState().pendingEdges).toBe(beforeEdges);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });
});

describe("useCanvasNodeDeletion — handleCancel", () => {
  it("clears pendingDelete without mutating graph or configSlice", async () => {
    hydrateChainABC();
    act(() => {
      useConfigSlice
        .getState()
        .openNode({ nodeId: "b", initialValues: {} });
    });
    const beforeActive = useConfigSlice.getState().activeNodeId;
    const beforeNodes = useGraphSlice.getState().pendingNodes;
    const { result } = renderHook(() => useCanvasNodeDeletion());
    await act(async () => {
      await result.current.handleBeforeDelete({
        nodes: [flowNode("b")],
        edges: [],
      });
    });
    expect(result.current.pendingDelete?.kind).toBe("single");
    act(() => {
      result.current.handleCancel();
    });
    expect(result.current.pendingDelete).toBeNull();
    expect(useGraphSlice.getState().pendingNodes).toBe(beforeNodes);
    expect(useConfigSlice.getState().activeNodeId).toBe(beforeActive);
  });
});

describe("useCanvasNodeDeletion — keyboard delete is safe (no raw removeNode)", () => {
  it("never calls graphSlice.removeNode — only deleteNodeAndRewire on confirm", async () => {
    hydrateChainABC();
    const removeNodeSpy = jest.spyOn(useGraphSlice.getState(), "removeNode");
    const { result } = renderHook(() => useCanvasNodeDeletion());
    await act(async () => {
      await result.current.handleBeforeDelete({
        nodes: [flowNode("b")],
        edges: [],
      });
    });
    act(() => {
      result.current.handleConfirm();
    });
    // deleteNodeAndRewire owns the mutation; raw removeNode is never touched.
    expect(removeNodeSpy).not.toHaveBeenCalled();
    removeNodeSpy.mockRestore();
  });
});
