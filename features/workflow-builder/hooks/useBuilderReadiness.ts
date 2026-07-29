"use client";

import { useMemo } from "react";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type {
  AgentConnectionSignal,
  AgentReadinessVerdict,
} from "@/core/workflows/agentReadiness";
import type { RequiredFieldsByType } from "../validation/collectBuilderValidationIssues";
import { useConnectionReadiness } from "./useConnectionReadiness";
import { useAgentReadiness } from "./useAgentReadiness";

/**
 * REACT-AGENT-READINESS-1 — builder wiring for the readiness verdict, extracted
 * from WorkflowBuilder so the component stays a thin wiring layer.
 *
 * Picks the graph to evaluate (the proposed end-state while an edit preview is
 * active, else the live draft for the post-apply window), resolves the
 * server-side connection signal for it, and returns the readiness verdict. All
 * decisions live in the pure core helper + the two underlying hooks.
 */

export interface UseBuilderReadinessInput {
  readonly workflowId: string;
  readonly previewReviewActive: boolean;
  readonly proposedDefinition: WorkflowDefinition | null;
  /** Truthy while the post-apply notice is showing (drives the post-apply readiness window). */
  readonly applyNoticeActive: boolean;
  /**
   * REACT-AGENT-GUIDED-BUILD-1 — truthy while a guided build session is running.
   * Extends the readiness evaluation window beyond the apply notice (the guided
   * card needs the verdict until the user finishes or exits, and after a reload
   * that restored the session). Same live-draft target as the post-apply window.
   */
  readonly guidedSessionActive?: boolean;
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
  readonly requiredFieldsByType?: RequiredFieldsByType;
  readonly workflowState: string;
  readonly localOnly?: boolean;
  readonly viewerCanRunEdit?: boolean;
}

export interface UseBuilderReadinessResult {
  readonly verdict: AgentReadinessVerdict;
  /**
   * The server-resolved connection signal the verdict was computed from —
   * exposed so the guided Connect stage can list EVERY provider (connected
   * ones included) rather than just the blockers.
   */
  readonly connection: AgentConnectionSignal;
  /** Imperatively re-resolve connection state for the current graph. */
  readonly refreshConnections: () => void;
}

export function useBuilderReadiness(
  input: UseBuilderReadinessInput,
): UseBuilderReadinessResult {
  const {
    workflowId,
    previewReviewActive,
    proposedDefinition,
    applyNoticeActive,
    guidedSessionActive,
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
    workflowState,
    localOnly,
    viewerCanRunEdit,
  } = input;

  // Target: the proposed end-state while previewing, else the live draft while
  // the post-apply notice OR a guided build session keeps the window open.
  const definition = useMemo<WorkflowDefinition | null>(() => {
    if (previewReviewActive && proposedDefinition) return proposedDefinition;
    if (!previewReviewActive && (applyNoticeActive || guidedSessionActive)) {
      return { nodes: [...pendingNodes], edges: [...pendingEdges] };
    }
    return null;
  }, [
    previewReviewActive,
    proposedDefinition,
    applyNoticeActive,
    guidedSessionActive,
    pendingNodes,
    pendingEdges,
  ]);

  const { signal: connection, refresh: refreshConnections } = useConnectionReadiness({
    workflowId,
    definition,
    enabled: !localOnly,
  });

  const verdict = useAgentReadiness({
    active: definition !== null,
    isEditPreview: previewReviewActive,
    definition,
    pendingNodes,
    ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    workflowState,
    ...(localOnly ? { localOnly } : {}),
    ...(viewerCanRunEdit !== undefined ? { viewerCanRunEdit } : {}),
    connection,
    // A run only reflects THIS change once it has been applied (preview closed).
    runReflectsChange: !previewReviewActive && (applyNoticeActive || !!guidedSessionActive),
  });

  return { verdict, connection, refreshConnections };
}
