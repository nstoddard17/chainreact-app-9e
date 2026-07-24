"use client";

import { useMemo } from "react";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import {
  classifyDestructivePreview,
  type DestructivePreviewClassification,
} from "@/core/workflows/destructivePreview";

/**
 * DOC-FINAL-ACCEPTANCE-1 — the SINGLE destructive classification for the active
 * React-Agent preview, memoized for referential stability. Read by BOTH the center
 * Document ghost preview and the right-drawer apply-mode flow so the two surfaces
 * never diverge on what counts as destructive. Additive skeletons and non-removing
 * edits classify as non-destructive → unchanged one-click apply.
 *
 * Thin wrapper over the pure `classifyDestructivePreview`; no I/O, no store access.
 */
export function useDestructivePreview(
  pendingNodes: readonly WorkflowNode[],
  pendingEdges: readonly WorkflowEdge[],
  previewOverlay: { readonly proposedDefinition?: WorkflowDefinition | undefined } | null | undefined,
): DestructivePreviewClassification {
  return useMemo(
    () =>
      classifyDestructivePreview({
        liveNodes: pendingNodes,
        liveEdges: pendingEdges,
        proposedDefinition: previewOverlay?.proposedDefinition ?? null,
      }),
    [pendingNodes, pendingEdges, previewOverlay],
  );
}
