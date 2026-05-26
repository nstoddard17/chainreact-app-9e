"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { shouldShowPlusButton } from "../utils/shouldShowPlusButton";

/**
 * Custom workflow edge (Slice 4.BUILDER-ADD-FLOW-1, restyled in
 * 4.BUILDER-DESIGN-PARITY-1).
 *
 * Edge geometry switched from bezier (`getBezierPath`) to stepped /
 * orthogonal (`getSmoothStepPath`) to match the Anthropic ChainV2
 * dense / technical aesthetic. Stroke color and width are bound to
 * the builder design tokens so they read against the panel chrome.
 *
 * Plus-button visibility is unchanged — still gated through the pure
 * `shouldShowPlusButton` helper. The button is rendered inside
 * `EdgeLabelRenderer` so it lives in screen-space (clickable above
 * ReactFlow's pan/zoom transforms).
 *
 * Boundary rules unchanged:
 *   - Presentational. No slice reads. `data.onPlusClick` flows from
 *     the canvas / WorkflowBuilder.
 *   - No provider-specific branches.
 */
export interface WorkflowEdgeData extends Record<string, unknown> {
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

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    // Slight corner radius so the orthogonal corners read soft instead
    // of pixel-sharp. Matches the design's edge-line treatment.
    borderRadius: 8,
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
          stroke: selected
            ? "var(--builder-accent)"
            : "var(--builder-border-strong)",
          ...style,
        }}
      />
      {showPlus ? (
        <EdgeLabelRenderer>
          <div
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
              className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[12px] leading-none transition-colors"
              style={{
                background: "var(--builder-panel)",
                color: "var(--builder-muted)",
                border: "1px dashed var(--builder-border-strong)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--builder-accent)";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.borderStyle = "solid";
                e.currentTarget.style.borderColor = "var(--builder-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--builder-panel)";
                e.currentTarget.style.color = "var(--builder-muted)";
                e.currentTarget.style.borderStyle = "dashed";
                e.currentTarget.style.borderColor = "var(--builder-border-strong)";
              }}
            >
              +
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
