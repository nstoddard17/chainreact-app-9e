"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { branchLabelDisplay } from "../utils/branchHandles";
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
  /**
   * HERMES-AGENT-PREVIEW-DIFF-GRAPH — when this edge is part of an AI preview diff graph, its status
   * drives a diff treatment: `added` (dashed accent), `removed` (dashed/faded red). `unchanged` / absent
   * render the normal edge. Read-only previews never show the plus-button.
   */
  diffStatus?: "unchanged" | "added" | "removed";
}

/** Diff stroke treatment for a preview edge. Returns null for a normal (non-preview / unchanged) edge. */
function diffEdgeStyle(status: WorkflowEdgeData["diffStatus"]): { stroke: string; strokeDasharray: string; opacity?: number } | null {
  if (status === "added") return { stroke: "var(--builder-success)", strokeDasharray: "6 4" };
  if (status === "removed") return { stroke: "var(--builder-danger)", strokeDasharray: "6 4", opacity: 0.55 };
  return null;
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
    label,
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

  const diff = diffEdgeStyle(edgeData.diffStatus);
  const showPlus =
    !diff &&
    edgeData.diffStatus === undefined &&
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
          ...(diff ? { stroke: diff.stroke, strokeDasharray: diff.strokeDasharray, ...(diff.opacity !== undefined ? { opacity: diff.opacity } : {}) } : {}),
        }}
      />
      {typeof label === "string" && label.length > 0 ? (
        // BRANCH-ENT-1 C4 — the persisted branch route, rendered ON the edge
        // so True/False/route paths are visually distinguishable. Custom edge
        // components must draw `label` themselves; before this, branch labels
        // were invisible on the canvas. Sits above the plus-button slot.
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 16}px)`,
              pointerEvents: "none",
            }}
            data-testid={`workflow-edge-label-${id}`}
            className="z-10"
          >
            <span
              className="builder-mono inline-flex items-center rounded-[3px] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.05em]"
              style={{
                background: "var(--builder-accent-soft)",
                color: "var(--builder-accent)",
                border: "1px solid var(--builder-accent)",
              }}
            >
              {branchLabelDisplay(label)}
            </span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
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
