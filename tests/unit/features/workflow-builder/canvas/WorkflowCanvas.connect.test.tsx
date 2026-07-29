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
    // BUILDER-CANVAS-ZOOM-FOCUS-1 — the minimap wrapper reads the live viewport scale from React
    // Flow's store. These suites stub ReactFlowProvider to a Fragment, so there is no real store;
    // stand in with a settled zoom of 1 (a normal fitted canvas).
    useStore: (selector: (s: { transform: [number, number, number] }) => unknown) =>
      selector({ transform: [0, 0, 1] }),
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
function callConnect(source: string, target: string, sourceHandle?: string) {
  const onConnect = capturedProps.onConnect as (c: {
    source: string;
    target: string;
    sourceHandle?: string | null;
  }) => void;
  act(() => onConnect({ source, target, sourceHandle: sourceHandle ?? null }));
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

  // BRANCH-ENT-1 C4 — the handle a connection is drawn from IS the branch
  // route. Business rule: a True-handle drag persists `label: "true"`, an
  // Always/default-handle drag persists an unlabeled cleanup edge, and the
  // same route can't be drawn twice while both routes may share a target.
  it("dragging from a branch handle persists that route's edge label", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act2", "branch:true");
    const created = edges().find((e) => e.from === "act1" && e.to === "act2");
    expect(created?.label).toBe("true");
  });

  it("dragging from the Always handle (or default handle) creates an UNLABELED cleanup edge", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act2", "branch-always");
    const cleanup = edges().find((e) => e.from === "act1" && e.to === "act2");
    expect(cleanup).toBeDefined();
    expect(cleanup?.label).toBeUndefined();
  });

  it("True and False routes may share a target, but the SAME route is blocked as a duplicate", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act2", "branch:true");
    callConnect("act1", "act2", "branch:false"); // different route, same target → allowed
    const pair = edges().filter((e) => e.from === "act1" && e.to === "act2");
    expect(pair.map((e) => e.label).sort()).toEqual(["false", "true"]);
    callConnect("act1", "act2", "branch:true"); // same route twice → blocked
    expect(
      edges().filter((e) => e.from === "act1" && e.to === "act2"),
    ).toHaveLength(2);
    expect(screen.getByTestId("connection-hint").textContent).toMatch(/already connects/i);
  });

  // RECONV-1 S2 — router 3-lane variant of the True/False-share-a-target rule.
  it("three Router lanes drawn to one shared target coexist; re-drawing a lane is blocked", () => {
    render(<WorkflowCanvas />);
    callConnect("act1", "act2", "branch:hot");
    callConnect("act1", "act2", "branch:warm");
    callConnect("act1", "act2", "branch:cold");
    const lanes = edges().filter((e) => e.from === "act1" && e.to === "act2");
    expect(lanes.map((e) => e.label).sort()).toEqual(["cold", "hot", "warm"]);
    callConnect("act1", "act2", "branch:warm"); // same lane twice → blocked
    expect(
      edges().filter((e) => e.from === "act1" && e.to === "act2"),
    ).toHaveLength(3);
    expect(screen.getByTestId("connection-hint").textContent).toMatch(/already connects/i);
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
