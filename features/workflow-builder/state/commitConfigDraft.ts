"use client";

import { useConfigSlice } from "./configSlice";
import { useGraphSlice } from "./graphSlice";

/**
 * Slice 4.AI-CONFIG-ASSIST CS-10 — the LOCAL node-config commit path.
 *
 * This is EXACTLY what the config rail's Save button does, factored into one place
 * so the chat-fill direct-fill flow commits a node the same way:
 *   1. write the in-progress config DRAFT into the canvas-pending graph node
 *      (`graphSlice.updateNodeConfig`), and
 *   2. mark the draft saved (`configSlice.markSaved`) so the rail shows it clean.
 *
 * LOCAL ONLY. `updateNodeConfig` flips the WORKFLOW's `graphSlice.isDirty` to true,
 * so the main toolbar Save button is STILL required to persist to the server. This
 * helper NEVER calls `graphSlice.save` (server persist), NEVER runs the workflow,
 * NEVER applies a WorkflowPatch, and NEVER mutates graph STRUCTURE (no add/remove of
 * nodes or edges — only the target node's config object is replaced).
 *
 * Returns false when there is no draft for `nodeId` (nothing to commit).
 */
export function commitNodeConfigDraft(nodeId: string): boolean {
  const config = useConfigSlice.getState();
  const draft = config.drafts[nodeId];
  if (!draft) return false;
  useGraphSlice.getState().updateNodeConfig(nodeId, draft.values as Record<string, unknown>);
  config.markSaved(nodeId);
  return true;
}
