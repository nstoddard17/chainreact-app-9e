/**
 * WorkflowCanvas preview-diff rendering (HERMES-AGENT-PREVIEW-DIFF-GRAPH).
 *
 * When a `previewDiff` is supplied the canvas renders ONE composed diff graph (read-only) INSTEAD of
 * the live editable graph — never a floating overlay. `@xyflow/react`'s `ReactFlow` is mocked to capture
 * the props the canvas passes, proving: diff nodes/edges flow in, the flow is non-interactive, and the
 * canvas marks `data-preview-diff`.
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
    ReactFlowProvider: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    useReactFlow: () => ({ setCenter: () => {}, getNode: () => undefined }),
    // BUILDER-CANVAS-ZOOM-FOCUS-1 — the minimap wrapper reads the live viewport scale from React
    // Flow's store. These suites stub ReactFlowProvider to a Fragment, so there is no real store;
    // stand in with a settled zoom of 1 (a normal fitted canvas).
    useStore: (selector: (s: { transform: [number, number, number] }) => unknown) =>
      selector({ transform: [0, 0, 1] }),
    Background: () => null,
    MiniMap: () => null,
    Controls: ({ children }: { children: ReactNode }) => React.createElement("div", null, children),
    ControlButton: ({ children }: { children: ReactNode }) => React.createElement("button", { type: "button" }, children),
  };
});

import { render, screen } from "@testing-library/react";
import { WorkflowCanvas } from "@/features/workflow-builder/canvas/WorkflowCanvas";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";
import type { PreviewDiffGraph } from "@/features/workflow-builder/utils/buildPreviewDiffGraph";

const liveDef: WorkflowDefinition = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 0, y: 0 } },
    { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 0, y: 200 } },
  ],
  edges: [{ id: "e1", from: "t1", to: "a1" }],
};

const diff: PreviewDiffGraph = {
  nodes: [
    { id: "t1", kind: "trigger", provider: "native", type: "manual.run", config: {}, position: { x: 400, y: 100 }, diffStatus: "unchanged" },
    { id: "email-1", kind: "action", provider: "gmail", type: "send_email", config: {}, position: { x: 400, y: 300 }, diffStatus: "added" },
    { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: {}, position: { x: 760, y: 300 }, diffStatus: "removed" },
  ],
  edges: [
    { id: "e2", from: "t1", to: "email-1", diffStatus: "added" },
    { id: "e1", from: "t1", to: "a1", diffStatus: "removed" },
  ],
};

function nodesProp() {
  return capturedProps.nodes as Array<{ id: string; data: { diffStatus?: string } }>;
}

beforeEach(() => {
  capturedProps = {};
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", liveDef);
});

describe("WorkflowCanvas — preview diff graph", () => {
  it("renders the ONE composed diff graph (read-only) instead of the live graph", () => {
    render(<WorkflowCanvas previewDiff={diff} />);
    // The nodes passed to ReactFlow are the diff nodes (3: unchanged trigger + added gmail + removed slack).
    const ids = nodesProp().map((n) => n.id).sort();
    expect(ids).toEqual(["a1", "email-1", "t1"]);
    expect(nodesProp().map((n) => n.data.diffStatus).sort()).toEqual(["added", "removed", "unchanged"]);
    // READ-ONLY: not draggable / connectable / selectable.
    expect(capturedProps.nodesDraggable).toBe(false);
    expect(capturedProps.nodesConnectable).toBe(false);
    expect(capturedProps.elementsSelectable).toBe(false);
    // The canvas marks preview-diff mode; no editing handlers are wired.
    expect(screen.getByTestId("workflow-canvas").getAttribute("data-preview-diff")).toBe("true");
    expect(capturedProps.onConnect).toBeUndefined();
    expect(capturedProps.onNodeClick).toBeUndefined();
  });

  it("without previewDiff, renders the live editable graph (interactive, no preview-diff marker)", () => {
    render(<WorkflowCanvas />);
    expect(nodesProp().map((n) => n.id).sort()).toEqual(["a1", "t1"]);
    expect(capturedProps.nodesDraggable).toBe(true);
    expect(screen.getByTestId("workflow-canvas").getAttribute("data-preview-diff")).toBeNull();
  });
});
