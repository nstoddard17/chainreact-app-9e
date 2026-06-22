"use client";

import { useConfigSlice } from "./configSlice";
import { useGraphSlice } from "./graphSlice";

/**
 * BUILDER-TOPBAR-UNDO-REDO — the top-bar undo/redo orchestrators.
 *
 * Each runs the pure-local graph-history step (`graphSlice.undo` / `redo`, which only restores a draft
 * graph snapshot and recomputes dirty) and then keeps an OPEN config panel in sync with the restored
 * graph, so the visible field can't show a stale value after navigating history:
 *   - if the active node's config changed, replace its open draft with the restored config
 *     (`configSlice.resyncDraftFromConfig` — full replace, so undone keys disappear), and
 *   - if the active node no longer exists (undo/redo removed it), close the panel.
 *
 * LOCAL ONLY. This NEVER saves/activates/runs/tests/publishes, never calls a route or model, never
 * touches run history or the React Agent transcript, and preserves the account/workflow context
 * (graphSlice.workflowId is untouched by undo/redo).
 */

function syncOpenConfigPanel(): void {
  const config = useConfigSlice.getState();
  const activeNodeId = config.activeNodeId;
  if (!activeNodeId) return; // no panel open → nothing to sync
  const node = useGraphSlice.getState().pendingNodes.find((n) => n.id === activeNodeId);
  if (!node) {
    // The active node was removed by the history navigation → close the now-orphaned panel.
    config.closeNode();
    return;
  }
  config.resyncDraftFromConfig({ nodeId: activeNodeId, config: node.config });
}

export function undoWithConfigSync(): void {
  useGraphSlice.getState().undo();
  syncOpenConfigPanel();
}

export function redoWithConfigSync(): void {
  useGraphSlice.getState().redo();
  syncOpenConfigPanel();
}
