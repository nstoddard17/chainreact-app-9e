"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { shouldShowPlusButton } from "../utils/shouldShowPlusButton";

/**
 * Custom workflow edge (Slice 4.BUILDER-ADD-FLOW-1).
 *
 * Wraps ReactFlow's bezier edge with an absolutely-positioned plus
 * button at the midpoint. Clicking the plus invokes
 * `data.onPlusClick(edgeId)`, which `WorkflowCanvas` wires to
 * `WorkflowBuilder`'s `handleEdgePlusClick` → opens AddNodePanel in
 * `insertAction` mode for this edge.
 *
 * Visibility policy is in the pure helper `shouldShowPlusButton` so the
 * conditions stay testable in isolation. The button is rendered inside
 * `EdgeLabelRenderer` so it lives in screen-space (not SVG-space) and
 * stays clickable above ReactFlow's pan/zoom transforms.
 *
 * Boundary rules:
 *   - Presentational. No slice reads. The `data.onPlusClick` callback
 *     is owned by the canvas / WorkflowBuilder.
 *   - No provider-specific branches.
 */
export interface WorkflowEdgeData extends Record<string, unknown> {
  /**
   * Click handler for the insert plus-button. Receives this edge's id
   * so the parent can open AddNodePanel with the right insert context.
   * When omitted, the plus-button doesn't render.
   */
  onPlusClick?: (edgeId: string) => void;
}

export function WorkflowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    selected,
    source,
    target,
    data,
  } = props;
  const edgeData = (data ?? {}) as WorkflowEdgeData;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const showPlus =
    typeof edgeData.onPlusClick === "function" &&
    shouldShowPlusButton({
      hasResolvedEndpoints: Boolean(source && target),
    });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2 : 1.5,
          ...style,
        }}
      />
      {showPlus ? (
        <EdgeLabelRenderer>
          <div
            // Absolute positioning via transform — required for
            // EdgeLabelRenderer overlays. `pointer-events: all` because
            // the parent <div> inside ReactFlow's EdgeLabelRenderer is
            // pointer-events:none by default so labels don't intercept
            // pan/zoom.
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            data-testid={`workflow-edge-plus-${id}`}
            className="z-10"
          >
            <button
              type="button"
              onClick={() => edgeData.onPlusClick?.(id)}
              aria-label="Insert action on this edge"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-input bg-background text-xs font-semibold text-muted-foreground shadow-sm hover:border-primary hover:bg-primary hover:text-primary-foreground"
            >
              +
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
