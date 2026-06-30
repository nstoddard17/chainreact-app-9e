"use client";

import { useMemo } from "react";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import type { ConfigDiff } from "@/core/workflows/buildConfigDiff";
import type { AgentPreviewRationale } from "@/core/workflows/buildPreviewRationale";
import {
  computeAgentApplyModes,
  type AgentApplyModeAvailability,
} from "@/core/workflows/agentApplyModes";
import {
  collectBuilderValidationIssues,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";
import { getTriggerKind } from "../state/triggerKind";

/**
 * REACT-AGENT-APPLY-MODES-1 — derive the deterministic apply-mode availability for the active
 * React Agent edit preview. Extracted from WorkflowBuilder so the component stays a thin wiring
 * layer; all decisions delegate to the pure `computeAgentApplyModes` core helper.
 *
 * Readiness is checked against the proposed END-STATE with the SAME builder validator the run-now
 * preflight uses (one ruleset). Risk comes from the preview rationale's high-risk field reasons.
 * Trigger + active state gate apply-and-test. Returns [] when no edit preview is active.
 */

export interface UseAgentApplyModeAvailabilityInput {
  /** True while an EDIT preview is active (the right rail shows the review panel). */
  readonly active: boolean;
  /** The proposed end-state graph (EDIT preview), or null for an additive skeleton / no preview. */
  readonly candidateDefinition: WorkflowDefinition | null;
  /** The live draft nodes (used for trigger-change detection + the additive testability fallback). */
  readonly pendingNodes: readonly WorkflowNode[];
  /** The value-level diff (used to detect a same-identity trigger config change). */
  readonly configDiff: ConfigDiff | null;
  /** The preview rationale — its high-risk field reasons supply the risk categories. */
  readonly rationale: AgentPreviewRationale | null;
  readonly requiredFieldsByType?: RequiredFieldsByType;
  /** The live workflow lifecycle state. */
  readonly workflowState: string;
  readonly localOnly?: boolean;
  /** Server-derived: false ⇒ the viewer can't run/edit (private-credential workflow). */
  readonly viewerCanRunEdit?: boolean;
}

export function useAgentApplyModeAvailability(
  input: UseAgentApplyModeAvailabilityInput,
): readonly AgentApplyModeAvailability[] {
  const {
    active,
    candidateDefinition,
    pendingNodes,
    configDiff,
    rationale,
    requiredFieldsByType,
    workflowState,
    localOnly,
    viewerCanRunEdit,
  } = input;

  const candidateReadiness = useMemo((): { ready: boolean; reason?: string } | null => {
    if (!active) return null;
    // Additive new-workflow skeletons have no end-state graph to validate pre-apply → not testable.
    if (!candidateDefinition) {
      return { ready: false, reason: "Finish setting up the new steps before testing." };
    }
    const issues = collectBuilderValidationIssues({
      pendingNodes: candidateDefinition.nodes,
      pendingEdges: candidateDefinition.edges,
      ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    });
    const firstError = issues.find((i) => i.severity === "error");
    return firstError ? { ready: false, reason: firstError.message } : { ready: true };
  }, [active, candidateDefinition, requiredFieldsByType]);

  const triggerChanged = useMemo(() => {
    if (!active || !candidateDefinition) return false;
    const cur = pendingNodes.find((n) => n.kind === "trigger");
    const next = candidateDefinition.nodes.find((n) => n.kind === "trigger");
    if (!cur && !next) return false;
    if (!cur || !next) return true;
    if (cur.id !== next.id || cur.provider !== next.provider || cur.type !== next.type) return true;
    // Same trigger identity → a config edit shows up as the trigger node in the value diff.
    return (configDiff?.nodes ?? []).some((n) => n.nodeId === next.id);
  }, [active, candidateDefinition, pendingNodes, configDiff]);

  return useMemo(() => {
    if (!active) return [];
    const triggerKindForTest = getTriggerKind(candidateDefinition?.nodes ?? pendingNodes);
    const canTest =
      triggerKindForTest === "manual" && !localOnly && viewerCanRunEdit !== false;
    const testDisabledReason = localOnly
      ? "Sign in to test this workflow."
      : viewerCanRunEdit === false
        ? "This workflow runs with the creator's private connection."
        : triggerKindForTest !== "manual"
          ? "Test runs are available only for manual-trigger workflows right now."
          : undefined;
    const riskCategories = [...new Set((rationale?.fieldReasons ?? []).map((r) => r.category))];
    return computeAgentApplyModes({
      isEditPreview: candidateDefinition !== null,
      candidateReady: candidateReadiness?.ready ?? false,
      ...(candidateReadiness?.reason ? { firstBlockingReason: candidateReadiness.reason } : {}),
      workflowActive: workflowState === "active",
      triggerChanged,
      canTest,
      ...(testDisabledReason ? { testDisabledReason } : {}),
      riskCategories,
    });
  }, [
    active,
    candidateDefinition,
    pendingNodes,
    localOnly,
    viewerCanRunEdit,
    workflowState,
    rationale,
    candidateReadiness,
    triggerChanged,
  ]);
}
