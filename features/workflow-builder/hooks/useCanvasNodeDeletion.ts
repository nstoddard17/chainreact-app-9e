"use client";

import { useCallback, useState } from "react";
import type { Edge as FlowEdge, Node as FlowNode } from "@xyflow/react";
import { useConfigSlice } from "../state/configSlice";
import { useGraphSlice } from "../state/graphSlice";
import {
  computeKeyboardDeleteIntent,
  type KeyboardDeleteIntent,
} from "../utils/computeKeyboardDeleteIntent";

/**
 * Canvas keyboard-delete state machine (Slice 4.BUILDER-NODE-DELETE-2).
 *
 * Wraps the pure `computeKeyboardDeleteIntent` helper + the safe
 * `graphSlice.deleteNodeAndRewire` action so the canvas's
 * `onBeforeDelete` callback can intercept ReactFlow's keyboard delete,
 * show the same confirmation dialog the inspector uses, and dispatch
 * the safe delete only after the user confirms.
 *
 * Behavior contract:
 *
 *  - **Edges-only deletion** (`nodes.length === 0`) → `handleBeforeDelete`
 *    returns `true`. ReactFlow proceeds; `onEdgesDelete` fires; the
 *    canvas's existing edge-delete handler dispatches `removeEdge` per
 *    edge.
 *  - **Single node** → computes the rewire preview via the pure helper,
 *    sets `pendingDelete = { kind: "single", nodeId, preview }`, returns
 *    `false` (cancels ReactFlow's auto-delete). The canvas mounts
 *    `DeleteNodeConfirmDialog` with this preview. On Confirm:
 *    `deleteNodeAndRewire(nodeId)` runs; on success `configSlice.dropNode`
 *    drops the per-node draft AND clears `activeNodeId` (the
 *    `WorkflowBuilder` transition effect then closes the right drawer).
 *  - **Multi-select** (`nodes.length > 1`) → sets
 *    `pendingDelete = { kind: "multi", count }`, returns `false`. The
 *    dialog renders a "select one at a time" message; the only action
 *    is Close. The graph is never mutated.
 *
 * Returns `Promise<boolean>` because ReactFlow's `onBeforeDelete` type
 * is async — we resolve synchronously inside an async function so the
 * promise settles in the same microtask. ReactFlow blocks the deletion
 * until the promise resolves; we never hold it open across the dialog
 * (returning `false` cancels right away, and our own dialog state
 * machine drives the eventual mutation).
 *
 * Pure local state — no Zustand slice. Each WorkflowCanvas mount owns
 * its own instance.
 */

export type CanvasPendingDelete = Extract<
  KeyboardDeleteIntent,
  { kind: "single" } | { kind: "multi" }
>;

export interface UseCanvasNodeDeletionResult {
  /** Current dialog state, or `null` when no delete is pending. */
  pendingDelete: CanvasPendingDelete | null;
  /**
   * Wire to ReactFlow's `onBeforeDelete` prop. Returns `true` to let
   * ReactFlow proceed (edges-only); `false` to cancel + show our dialog.
   */
  handleBeforeDelete(input: {
    nodes: readonly FlowNode[];
    edges: readonly FlowEdge[];
  }): Promise<boolean>;
  /**
   * Dispatch the safe delete for a pending single-node selection. Closes
   * the dialog. No-op for `multi` or `null` states.
   */
  handleConfirm(): void;
  /** Close the dialog without mutating the graph. */
  handleCancel(): void;
}

export function useCanvasNodeDeletion(): UseCanvasNodeDeletionResult {
  const pendingNodes = useGraphSlice((s) => s.pendingNodes);
  const pendingEdges = useGraphSlice((s) => s.pendingEdges);
  const deleteNodeAndRewire = useGraphSlice((s) => s.deleteNodeAndRewire);
  const dropNodeConfigDraft = useConfigSlice((s) => s.dropNode);

  const [pendingDelete, setPendingDelete] =
    useState<CanvasPendingDelete | null>(null);

  const handleBeforeDelete = useCallback(
    async ({ nodes }: { nodes: readonly FlowNode[]; edges: readonly FlowEdge[] }) => {
      const intent = computeKeyboardDeleteIntent({
        selectedNodeIds: nodes.map((n) => n.id),
        pendingNodes,
        pendingEdges,
      });
      if (intent.kind === "proceed") {
        return true;
      }
      if (intent.kind === "multi") {
        setPendingDelete({ kind: "multi", count: intent.count });
        return false;
      }
      setPendingDelete({
        kind: "single",
        nodeId: intent.nodeId,
        preview: intent.preview,
      });
      return false;
    },
    [pendingNodes, pendingEdges],
  );

  const handleConfirm = useCallback(() => {
    if (!pendingDelete || pendingDelete.kind !== "single") {
      setPendingDelete(null);
      return;
    }
    const { nodeId } = pendingDelete;
    const outcome = deleteNodeAndRewire(nodeId);
    setPendingDelete(null);
    if (outcome.ok) {
      // Drops the draft + clears activeNodeId (built into configSlice).
      // WorkflowBuilder's transition effect closes the right drawer when
      // activeNodeId clears, so we don't touch drawer state directly.
      dropNodeConfigDraft(nodeId);
    }
  }, [pendingDelete, deleteNodeAndRewire, dropNodeConfigDraft]);

  const handleCancel = useCallback(() => {
    setPendingDelete(null);
  }, []);

  return {
    pendingDelete,
    handleBeforeDelete,
    handleConfirm,
    handleCancel,
  };
}
