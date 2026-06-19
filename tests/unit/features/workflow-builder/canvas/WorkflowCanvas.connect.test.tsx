/**
 * BUILDER-CANVAS-CONNECTION-UX-AUDIT-1 — connection UX contract.
 *
 * Guards the connect path through `WorkflowCanvas`:
 *  - a VALID connection still creates an edge through the existing graph-slice
 *    mutation (`connectNodes`) — the source of truth;
 *  - an INVALID attempt (self-loop / duplicate) is BLOCKED (no edge added) and now
 *    surfaces the rejection reason as a transient hint instead of failing silently;
 *  - a connection-handle interaction never advances the config canvas-focus signal,
 *    so connecting never triggers the config-open focus/zoom.
 *
 * Mirrors `WorkflowCanvas.drag.test.tsx`: `@xyflow/react`'s `ReactFlow` is mocked to
 * capture the props the canvas passes (so we can drive `onConnect` directly) while the
 * canvas's own children — including the connection-hint banner — render for assertion.
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
    useReactFlow: () => ({ setCenter: () => {}, getNode: () => undefined }),
    Background: () => null,
    MiniMap: () => null,
    Controls: ({ children }: { children: ReactNode }) =>
      React.createElement("div", null, children),
    ControlButton: ({ children }: { children: ReactNode }) =>
      React.createElement("button", { type: "button" }, children),
  };
});

import { render, act, screen } from "@testing-library/react";
import { WorkflowCanvas } from "@/features/workflow-builder/canvas/WorkflowCanvas";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

// trig → act1 → act2 (act1→act2 NOT directly edged, so it's a clean valid target pair)
const baseDef: WorkflowDefinition = {
  nodes: [
    { id: "trig", kind: "trigger", provider: "slack", type: "message_received", config: {}, position: { x: 0, y: 0 } },
    { id: "act1", kind: "action", provider: "github", type: "add_comment", config: {}, position: { x: 0, y: 200 } },
    { id: "act2", kind: "action", provider: "github", type: "add_comment", config: {}, position: { x: 0, y: 400 } },
  ],
  edges: [{ id: "e1", from: "trig", to: "act1" }],
};

function edges() {
  return useGraphSlice.getState().pendingEdges;
}
function callConnect(source: string, target: string) {
  const onConnect = capturedProps.onConnect as (c: { source: string; target: string }) => void;
  act(() => onConnect({ source, target }));
}

beforeEach(() => {
  capturedProps = {};
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", baseDef);
});

describe("WorkflowCanvas — connection UX", () => {
  it("a valid connection creates an edge through the graph slice (existing mutation path)", () => {
    render(<WorkflowCanvas />);
    expect(typeof capturedProps.onConnect).toBe("function");
    const before = edges().length;
    callConnect("act1", "act2");
    expect(edges()).toHaveLength(before + 1);
    expect(edges().some((e) => e.from === "act1" && e.to === "act2")).toBe(true);
    // No invalid-connection hint on a valid connect.
    expect(screen.queryByTestId("connection-hint")).toBeNull();
  });

  it("a self-loop is blocked (no edge) and surfaces a clear hint instead of failing silently", () => {
    render(<WorkflowCanvas />);
    const before = edges().length;
    callConnect("act1", "act1");
    expect(edges()).toHaveLength(before); // graph state never goes invalid
    const hint = screen.getByTestId("connection-hint");
    expect(hint).toHaveAttribute("role", "status");
    expect(hint.textContent).toMatch(/self-loop/i);
  });

  it("a duplicate edge is blocked (no edge) and surfaces a clear hint", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act2"); // first time: valid
    const after = edges().length;
    callConnect("act1", "act2"); // second time: duplicate → blocked
    expect(edges()).toHaveLength(after);
    expect(screen.getByTestId("connection-hint").textContent).toMatch(/already exists/i);
  });

  it("dismissing the hint removes it", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act1");
    expect(screen.queryByTestId("connection-hint")).not.toBeNull();
    act(() => {
      (screen.getByTestId("connection-hint-dismiss") as HTMLButtonElement).click();
    });
    expect(screen.queryByTestId("connection-hint")).toBeNull();
  });

  it("a later valid connection clears a stale invalid-connection hint", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act1"); // invalid → hint shows
    expect(screen.queryByTestId("connection-hint")).not.toBeNull();
    callConnect("act1", "act2"); // valid → hint clears
    expect(screen.queryByTestId("connection-hint")).toBeNull();
    expect(edges().some((e) => e.from === "act1" && e.to === "act2")).toBe(true);
  });

  it("a connection-handle interaction never advances the canvas-focus signal (no config-open focus)", () => {
    render(<WorkflowCanvas />);
    const seqBefore = useConfigSlice.getState().canvasFocusSeq;
    callConnect("act1", "act2"); // valid connect
    callConnect("act1", "act1"); // invalid attempt
    // Connecting flows through the graph slice only — the config focus signal is
    // untouched, so a connect never triggers the config-open focus/zoom.
    expect(useConfigSlice.getState().canvasFocusSeq).toBe(seqBefore);
  });
});
