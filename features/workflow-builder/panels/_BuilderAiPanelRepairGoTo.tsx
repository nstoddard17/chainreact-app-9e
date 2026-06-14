"use client";

import { Button } from "@/components/ui/button";
import type { RepairPreview } from "@/lib/api/ai";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";

/**
 * Slice 4.AI-REPAIR-2F — "Go to field" navigation affordance for a blocked
 * repair preview. NAVIGATION ONLY: selects the affected node, opens its config
 * rail, pans the canvas to it, and highlights the field. NEVER writes a config
 * value, saves, runs, or mutates the graph — and there is NO Apply control.
 * Renders nothing unless the preview carries a `nodeId` focus target plus a
 * display LABEL; labels are the only thing shown (raw id/key are targets only).
 * Absent metadata (e.g. rehydrated history) → safe guidance with no button.
 */
export function RepairPreviewGoToTarget({
  preview,
}: {
  readonly preview: RepairPreview;
}) {
  // First blocked error that carries a node focus target AND a display label.
  const target = preview.validation.errors.find(
    (e) => e.nodeId && (e.fieldLabel || e.nodeLabel),
  );
  if (!target || !target.nodeId) return null;

  const { nodeId, path: fieldKey, fieldLabel, nodeLabel } = target;
  // Labels only — never the raw nodeId / field key.
  const label = fieldLabel ? `Open ${fieldLabel} field` : `Go to ${nodeLabel}`;

  function handleClick() {
    // Resolve the node's CURRENT config from the live graph for the rail draft.
    // If the node isn't on the canvas (stale preview), no-op — never throw.
    const node = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.id === nodeId);
    if (!node) return;
    useConfigSlice.getState().revealNode({
      nodeId: node.id,
      initialValues: node.config,
      ...(fieldKey ? { fieldKey } : {}),
    });
  }

  return (
    <div className="pt-0.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        data-testid="builder-ai-repair-preview-goto"
        className="h-7 text-xs"
      >
        {label}
      </Button>
    </div>
  );
}
