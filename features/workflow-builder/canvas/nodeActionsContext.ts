"use client";

import { createContext, useContext } from "react";

/**
 * Ambient node-level quick-action handlers (Slice 4.BUILDER-NODE-QUICK-ACTIONS-1).
 *
 * ReactFlow renders custom nodes itself, so the canvas can't pass per-node props
 * directly to `WorkflowNodeCard`. Rather than widen the node `data` payload (which
 * the workflow-builder-ui rule keeps a narrow read-only window), the canvas exposes
 * rename/delete handlers through this small context and the card consumes them.
 *
 * Handlers are optional: when a handler is absent (e.g. the card rendered in an
 * isolated unit test with no provider), the card simply omits that affordance —
 * never a broken/no-op button.
 */
export interface BuilderNodeActions {
  /**
   * Commit a user-facing rename for a node. Delegates to `graphSlice.renameNode`
   * (trims; a blank value clears the custom name back to the metadata default).
   * Display label only — never node identity.
   */
  readonly onRenameNode?: (nodeId: string, name: string) => void;
  /**
   * Request deletion of a node. Opens the SAME confirmation dialog + safe
   * edge-rewire path the keyboard-delete flow uses (`useCanvasNodeDeletion`).
   * Never deletes without confirmation.
   */
  readonly onRequestDeleteNode?: (nodeId: string) => void;
  /**
   * Slice 4.BUILDER-CANVAS-ERGONOMICS-FIX-1 — append a new action AFTER this node
   * (the tail "+"). Opens the action picker targeted at this exact branch end, so
   * an append never guesses which branch to extend.
   */
  readonly onAppendAfter?: (nodeId: string) => void;
}

const BuilderNodeActionsContext = createContext<BuilderNodeActions>({});

export const BuilderNodeActionsProvider = BuilderNodeActionsContext.Provider;

export function useBuilderNodeActions(): BuilderNodeActions {
  return useContext(BuilderNodeActionsContext);
}
