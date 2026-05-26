/**
 * Tests for features/workflow-builder/canvas/WorkflowEdge.
 *
 * ReactFlow's `EdgeLabelRenderer` portal mounts inside a target div
 * that only initializes when the canvas has real dimensions —
 * jsdom can't satisfy that. We replace `EdgeLabelRenderer` with a
 * passthrough so the plus-button surfaces in the test DOM, and we
 * render `WorkflowEdge` directly inside an `<svg>` (BaseEdge expects
 * SVG context) rather than going through ReactFlow's full pipeline,
 * which won't render edges in jsdom without node-measurement.
 */
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: unknown }) =>
      children as React.ReactElement,
  };
});

import type * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Position, type EdgeProps } from "@xyflow/react";
import { WorkflowEdge } from "@/features/workflow-builder/canvas/WorkflowEdge";

function renderEdge(
  data: { onPlusClick?: (edgeId: string) => void } | undefined,
  overrides: Partial<EdgeProps> = {},
) {
  const props: EdgeProps = {
    id: "e-1",
    source: "a",
    target: "b",
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {},
    markerEnd: undefined,
    selected: false,
    animated: false,
    sourceHandleId: null,
    targetHandleId: null,
    interactionWidth: 20,
    type: "workflowEdge",
    label: undefined,
    labelStyle: undefined,
    labelShowBg: undefined,
    labelBgStyle: undefined,
    labelBgPadding: undefined,
    labelBgBorderRadius: undefined,
    data,
    ...overrides,
  } as unknown as EdgeProps;
  return render(
    <svg>
      <WorkflowEdge {...props} />
    </svg>,
  );
}

describe("WorkflowEdge", () => {
  it("renders the plus-button when data.onPlusClick is supplied", () => {
    const onPlusClick = jest.fn();
    renderEdge({ onPlusClick });
    expect(screen.getByTestId("workflow-edge-plus-e-1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /insert action on this edge/i }),
    ).toBeInTheDocument();
  });

  it("does NOT render the plus-button when data is undefined", () => {
    renderEdge(undefined);
    expect(screen.queryByTestId("workflow-edge-plus-e-1")).toBeNull();
  });

  it("does NOT render the plus-button when onPlusClick is omitted from data", () => {
    renderEdge({});
    expect(screen.queryByTestId("workflow-edge-plus-e-1")).toBeNull();
  });

  it("clicking the plus-button calls onPlusClick with the edge id", () => {
    const onPlusClick = jest.fn();
    renderEdge({ onPlusClick });
    fireEvent.click(
      screen.getByRole("button", { name: /insert action on this edge/i }),
    );
    expect(onPlusClick).toHaveBeenCalledWith("e-1");
  });

  it("does NOT render the plus-button when source / target endpoints aren't resolved", () => {
    const onPlusClick = jest.fn();
    renderEdge({ onPlusClick }, { source: "", target: "" });
    expect(screen.queryByTestId("workflow-edge-plus-e-1")).toBeNull();
  });
});
