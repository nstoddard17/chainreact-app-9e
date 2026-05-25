"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "../adapters";

/**
 * Custom node renderer for the workflow canvas.
 *
 * Slice 3.5 — single renderer for both trigger and action kinds.
 * Triggers omit the top (target) handle (nothing connects into a
 * trigger); actions omit nothing (they both receive and produce edges).
 *
 * Visual: bordered card with kind chip + provider label + type. Mirrors
 * the NodeRow component in NodeList.tsx so the list/rail and canvas
 * surfaces feel coherent to authors.
 *
 * Important boundaries:
 *   - This component is presentational. It does NOT call graphSlice or
 *     configSlice. Selection / drag / connect are handled by React Flow
 *     at the canvas level and dispatched there.
 *   - `data` shape is the narrow `WorkflowNodeData` projection from
 *     `canvas/adapters.ts`. Do NOT widen it to the full WorkflowNode —
 *     editing through React Flow's data API would defeat
 *     single-source-of-truth.
 */
export function WorkflowNodeView({
  data,
  selected,
}: NodeProps & { data: WorkflowNodeData }) {
  const isTrigger = data.kind === "trigger";
  const providerLabel = data.providerLabel ?? data.provider;
  return (
    <div
      data-testid="workflow-node-view"
      data-kind={data.kind}
      data-selected={selected ? "true" : undefined}
      className={
        selected
          ? "flex w-[260px] flex-col gap-1 rounded border-2 border-primary bg-card p-3 shadow-sm"
          : "flex w-[260px] flex-col gap-1 rounded border border-input bg-card p-3 shadow-sm"
      }
    >
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Top}
          isConnectableStart={false}
          aria-label="Incoming edge target"
        />
      ) : null}
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {data.kind}
      </span>
      <span className="text-sm font-medium">{providerLabel}</span>
      <span className="text-xs text-muted-foreground">
        {data.type ? data.type : "(unconfigured)"}
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        aria-label="Outgoing edge source"
      />
    </div>
  );
}
