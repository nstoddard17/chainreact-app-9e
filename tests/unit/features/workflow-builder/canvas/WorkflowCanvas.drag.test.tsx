/**
 * BUILDER-CANVAS-NODE-DRAG-UX-AUDIT-1 — controlled-flow drag contract.
 *
 * Root cause this guards against: `<ReactFlow>` was bound straight to the
 * slice-derived nodes with NO `onNodesChange`, so React Flow could not move a node
 * during a drag (it only jumped on drag-stop). We now run a CONTROLLED flow — RF's
 * changes apply to local state live, and the graph slice is written ONLY at
 * `onNodeDragStop`.
 *
 * `@xyflow/react`'s `ReactFlow` is mocked to capture the props the canvas passes
 * (real `applyNodeChanges` is kept so the controlled-state reducer is exercised).
 * This proves the contract without depending on RF's real pointer/drag internals.
 */
import type { ReactNode } from "react";

let capturedProps: Record<string, unknown> = {};
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  const React = jest.requireActual("react");
  return {
    ...actual,
    ReactFlow: (props: Record<string, unknown>) => {
      capturedProps = props;
      return React.createElement("div", { "data-testid": "rf-mock" }, props.children as ReactNode);
    },
    ReactFlowProvider: ({ children }: { children: ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    // The real provider's zustand store isn't mounted under the mocked ReactFlow, so
    // stub the one hook the canvas reads outside <ReactFlow> (useCanvasNodeFocus).
    useReactFlow: () => ({ setCenter: () => {}, getNode: () => undefined }),
    Background: () => null,
    MiniMap: () => null,
    Controls: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    ControlButton: ({ children }: { children: ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
  };
});

import { render, act } from "@testing-library/react";
import { WorkflowCanvas } from "@/features/workflow-builder/canvas/WorkflowCanvas";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

const baseDef: WorkflowDefinition = {
  nodes: [
    { id: "trig", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
    { id: "act", kind: "action", provider: "github", type: "add_comment", config: {}, position: { x: 0, y: 200 } },
  ],
  edges: [{ id: "e1", from: "trig", to: "act" }],
};

function nodesProp() {
  return capturedProps.nodes as Array<{ id: string; position: { x: number; y: number } }>;
}
function posOf(id: string) {
  return nodesProp().find((n) => n.id === id)!.position;
}
function slicePosOf(id: string) {
  return useGraphSlice.getState().pendingNodes.find((n) => n.id === id)!.position;
}

beforeEach(() => {
  capturedProps = {};
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", baseDef);
});

describe("WorkflowCanvas — controlled-flow drag", () => {
  it("is a controlled flow: passes both `nodes` and an `onNodesChange` handler", () => {
    render(<WorkflowCanvas />);
    expect(Array.isArray(capturedProps.nodes)).toBe(true);
    expect(nodesProp()).toHaveLength(2);
    expect(typeof capturedProps.onNodesChange).toBe("function");
  });

  it("a live drag position change moves the node locally but does NOT persist to the slice", () => {
    render(<WorkflowCanvas />);
    const onNodesChange = capturedProps.onNodesChange as (changes: unknown[]) => void;
    act(() => {
      onNodesChange([{ id: "act", type: "position", position: { x: 140, y: 260 }, dragging: true }]);
    });
    // Live: the node RF renders follows the pointer…
    expect(posOf("act")).toEqual({ x: 140, y: 260 });
    // …but the slice (source of truth) is untouched mid-drag — no per-mousemove persist,
    // so slice subscribers (readiness / AI / autosave) don't recompute during a drag.
    expect(slicePosOf("act")).toEqual({ x: 0, y: 200 });
  });

  it("persists the final position to the slice on drag stop", () => {
    render(<WorkflowCanvas />);
    const onNodeDragStop = capturedProps.onNodeDragStop as (e: unknown, node: unknown) => void;
    act(() => {
      onNodeDragStop({}, { id: "act", position: { x: 140, y: 260 } });
    });
    // No overlap at the drop point → the resolved position is the drop position.
    expect(slicePosOf("act")).toEqual({ x: 140, y: 260 });
  });
});
