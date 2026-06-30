"use client";

import { useMemo } from "react";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import type { AgentReadinessVerdict } from "@/core/workflows/agentReadiness";
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
  readonly pendingNodes: readonly WorkflowNode[];
  readonly pendingEdges: readonly WorkflowEdge[];
  readonly requiredFieldsByType?: RequiredFieldsByType;
  readonly workflowState: string;
  readonly localOnly?: boolean;
  readonly viewerCanRunEdit?: boolean;
}

export function useBuilderReadiness(
  input: UseBuilderReadinessInput,
): AgentReadinessVerdict {
  const {
    workflowId,
    previewReviewActive,
    proposedDefinition,
    applyNoticeActive,
    pendingNodes,
    pendingEdges,
    requiredFieldsByType,
    workflowState,
    localOnly,
    viewerCanRunEdit,
  } = input;

  // Target: the proposed end-state while previewing, else the live draft for a
  // short window after an apply (so readiness keeps answering once the rail closes).
  const definition = useMemo<WorkflowDefinition | null>(() => {
    if (previewReviewActive && proposedDefinition) return proposedDefinition;
    if (!previewReviewActive && applyNoticeActive) {
      return { nodes: [...pendingNodes], edges: [...pendingEdges] };
    }
    return null;
  }, [previewReviewActive, proposedDefinition, applyNoticeActive, pendingNodes, pendingEdges]);

  const connection = useConnectionReadiness({
    workflowId,
    definition,
    enabled: !localOnly,
  });

  return useAgentReadiness({
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
    runReflectsChange: !previewReviewActive && applyNoticeActive,
  });
}
