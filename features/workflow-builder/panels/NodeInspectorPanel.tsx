"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfigModalShell } from "../config-modal/ConfigModalShell";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  deleteNodeFromGraph,
  type DeleteNodeFromGraphResult,
} from "../utils/deleteNodeFromGraph";
import { DeleteNodeConfirmDialog } from "./DeleteNodeConfirmDialog";

/**
 * Inspector payload for the builder right drawer (Slice 4.BUILDER-INSPECTOR-1,
 * restyled in 4.BUILDER-DESIGN-PARITY-1, delete affordance added in
 * 4.BUILDER-NODE-DELETE-1).
 *
 * Wraps `ConfigModalShell` with the Anthropic ChainV2 inspector chrome:
 *   - Tab strip (Setup / Advanced / Test / Variables) — Setup is the
 *     only active tab in V2 today; the others are disabled placeholders.
 *   - **Delete node** button in the footer that opens a
 *     `DeleteNodeConfirmDialog`. The dialog previews the rewire plan via
 *     the pure helper and lets the user confirm or cancel.
 *
 * After a successful delete:
 *   - `graphSlice.deleteNodeAndRewire` updates pendingNodes/pendingEdges
 *     and flips `isDirty`.
 *   - `configSlice.dropNode(deletedId)` drops the per-node draft AND clears
 *     `activeNodeId` (built into the slice). The `WorkflowBuilder` transition
 *     effect notices `activeNodeId === null` and closes the right drawer —
 *     no direct drawer manipulation needed here.
 *
 * The schema-driven form, validation, Save / Cancel, and metadata lookup
 * logic inside `ConfigModalShell` are untouched. The drawer around this
 * component still owns the close (× button + Esc).
 */
export function NodeInspectorPanel() {
  return (
    <div
      data-testid="node-inspector-panel"
      className="flex flex-1 flex-col"
      style={{ minHeight: 0 }}
    >
      <InspectorTabs />
      <div className="flex flex-1 flex-col overflow-y-auto">
        <ConfigModalShell />
        <DeleteNodeAffordance />
      </div>
    </div>
  );
}

/**
 * Footer affordance for deleting the active node.
 *
 * Renders nothing when no node is active (the inspector itself is hidden
 * in that case, but the affordance also short-circuits for defense in
 * depth). On click, opens the confirmation dialog with a dry-run preview
 * computed from the pure helper. On confirm, dispatches the slice action
 * + drops the config draft (which clears `activeNodeId` → closes the
 * drawer via the parent's transition effect).
 */
function DeleteNodeAffordance() {
  const activeNodeId = useConfigSlice((s) => s.activeNodeId);
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const deleteNodeAndRewire = useGraphSlice((s) => s.deleteNodeAndRewire);
  const dropNodeConfigDraft = useConfigSlice((s) => s.dropNode);

  const [pendingPreview, setPendingPreview] =
    useState<DeleteNodeFromGraphResult | null>(null);

  const activeNode = useMemo(
    () => (activeNodeId ? pendingNodes.find((n) => n.id === activeNodeId) : undefined),
    [pendingNodes, activeNodeId],
  );

  const handleDeleteClick = useCallback(() => {
    if (!activeNodeId) return;
    const preview = deleteNodeFromGraph({
      nodes: pendingNodes,
      edges: pendingEdges,
      nodeId: activeNodeId,
    });
    setPendingPreview(preview);
  }, [activeNodeId, pendingNodes, pendingEdges]);

  const handleCancel = useCallback(() => {
    setPendingPreview(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!activeNodeId) {
      setPendingPreview(null);
      return;
    }
    const outcome = deleteNodeAndRewire(activeNodeId);
    setPendingPreview(null);
    if (outcome.ok) {
      // Drops the draft AND clears activeNodeId (built into configSlice).
      // The WorkflowBuilder transition effect closes the right drawer when
      // activeNodeId clears, so we don't touch drawer state here.
      dropNodeConfigDraft(activeNodeId);
    }
  }, [activeNodeId, deleteNodeAndRewire, dropNodeConfigDraft]);

  if (!activeNode) return null;

  return (
    <>
      <div
        className="flex items-center justify-end gap-2 border-t px-4 py-3"
        style={{
          borderColor: "var(--builder-border)",
          background: "var(--builder-panel-2)",
        }}
        data-testid="node-inspector-delete-row"
      >
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={handleDeleteClick}
          data-testid="node-inspector-delete-button"
        >
          Delete node
        </Button>
      </div>
      {pendingPreview !== null ? (
        <DeleteNodeConfirmDialog
          node={activeNode}
          preview={pendingPreview}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : null}
    </>
  );
}

function InspectorTabs() {
  return (
    <div
      role="tablist"
      data-testid="node-inspector-tabs"
      className="flex gap-0.5 px-2"
      style={{
        background: "var(--builder-panel-2)",
        borderBottom: "1px solid var(--builder-border)",
      }}
    >
      <Tab label="Setup" active />
      <Tab label="Advanced" disabled />
      <Tab label="Test" disabled />
      <Tab label="Variables" disabled />
    </div>
  );
}

function Tab({
  label,
  active,
  disabled,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active ? "true" : "false"}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className="inline-flex items-center gap-1.5 px-2.5 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        background: active ? "var(--builder-panel)" : "transparent",
        borderBottom: `2px solid ${active ? "var(--builder-accent)" : "transparent"}`,
        color: active ? "var(--builder-text)" : "var(--builder-muted)",
        marginBottom: -1,
        border: "0",
      }}
    >
      {label}
    </button>
  );
}
