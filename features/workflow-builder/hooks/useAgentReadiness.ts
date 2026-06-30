"use client";

import { useMemo } from "react";
import type { WorkflowDefinition, WorkflowNode } from "@/contracts/workflow";
import {
  computeAgentReadiness,
  type AgentConnectionSignal,
  type AgentReadinessTestStatus,
  type AgentReadinessVerdict,
} from "@/core/workflows/agentReadiness";
import { getNodeDisplayName } from "@/core/workflows/nodeDisplayName";
import {
  collectBuilderValidationIssues,
  type RequiredFieldsByType,
} from "../validation/collectBuilderValidationIssues";
import { getTriggerKind } from "../state/triggerKind";
import { useRunSlice, type LatestRunStatus } from "../state/runSlice";

/**
 * REACT-AGENT-READINESS-1 — derive the readiness verdict for the React Agent
 * change currently being reviewed (an active edit preview) or just applied.
 *
 * This is the single gathering point: it runs the SAME builder validator the
 * header pill + run-now preflight use against the END-STATE graph, detects an
 * active-workflow trigger change, reads the latest run status, and folds in the
 * server-resolved connection signal — then delegates the verdict to the pure
 * `computeAgentReadiness` core helper. It invents nothing and reads no config
 * values.
 *
 * Test-state honesty: a run only counts toward THIS change once the change has
 * been applied (`runReflectsChange`). While a preview is still open the proposed
 * change has not been run, so test status is forced to `not_tested` — the verdict
 * can never claim a stale prior run "passed" the new change.
 */

function mapRunStatus(status: LatestRunStatus): AgentReadinessTestStatus {
  switch (status) {
    case "pending":
      return "running";
    case "succeeded":
      return "passed";
    case "failed":
      return "failed";
    case "idle":
    case "lost":
    default:
      return "not_tested";
  }
}

export interface UseAgentReadinessInput {
  /** True while a readiness target exists (an edit preview is active, or a just-applied draft). */
  readonly active: boolean;
  /** True for an active edit preview (vs a just-applied draft post-apply). */
  readonly isEditPreview: boolean;
  /** The end-state graph: the candidate while previewing, else the live draft. */
  readonly definition: WorkflowDefinition | null;
  /** The live draft trigger node list, used to detect a trigger change against the candidate. */
  readonly pendingNodes: readonly WorkflowNode[];
  readonly requiredFieldsByType?: RequiredFieldsByType;
  /** The live workflow lifecycle state. */
  readonly workflowState: string;
  readonly localOnly?: boolean;
  /** Server-derived: false ⇒ the viewer can't run/edit (private-credential workflow). */
  readonly viewerCanRunEdit?: boolean;
  /** The server-resolved connection signal (from `useConnectionReadiness`). */
  readonly connection: AgentConnectionSignal;
  /** True once the change is applied, so the latest run reflects it (else not_tested). */
  readonly runReflectsChange: boolean;
}

export function useAgentReadiness(
  input: UseAgentReadinessInput,
): AgentReadinessVerdict {
  const {
    active,
    isEditPreview,
    definition,
    pendingNodes,
    requiredFieldsByType,
    workflowState,
    localOnly,
    viewerCanRunEdit,
    connection,
    runReflectsChange,
  } = input;

  const runStatus = useRunSlice((s) => s.status);

  return useMemo(() => {
    if (!active || !definition) {
      return computeAgentReadiness({
        active: false,
        validationIssues: [],
        triggerChanged: false,
        workflowActive: workflowState === "active",
        canTest: false,
        connection,
        lastTestStatus: runReflectsChange ? mapRunStatus(runStatus) : "not_tested",
      });
    }

    const validationIssues = collectBuilderValidationIssues({
      pendingNodes: definition.nodes,
      pendingEdges: definition.edges,
      ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
    });

    const nodeLabels = new Map<string, string>(
      definition.nodes.map((n) => [n.id, getNodeDisplayName(n)]),
    );

    // Trigger-change detection is only meaningful while previewing a candidate
    // against the live draft; post-apply the change is already in the draft and
    // lifecycle deactivation is owned by the save path.
    let triggerChanged = false;
    if (isEditPreview) {
      const cur = pendingNodes.find((n) => n.kind === "trigger");
      const next = definition.nodes.find((n) => n.kind === "trigger");
      if (!cur && !next) triggerChanged = false;
      else if (!cur || !next) triggerChanged = true;
      else
        triggerChanged =
          cur.id !== next.id || cur.provider !== next.provider || cur.type !== next.type;
    }

    const triggerKind = getTriggerKind(definition.nodes);
    const canTest =
      triggerKind === "manual" && !localOnly && viewerCanRunEdit !== false;

    return computeAgentReadiness({
      active: true,
      validationIssues,
      nodeLabels,
      triggerChanged,
      workflowActive: workflowState === "active",
      canTest,
      connection,
      lastTestStatus: runReflectsChange ? mapRunStatus(runStatus) : "not_tested",
    });
  }, [
    active,
    isEditPreview,
    definition,
    pendingNodes,
    requiredFieldsByType,
    workflowState,
    localOnly,
    viewerCanRunEdit,
    connection,
    runReflectsChange,
    runStatus,
  ]);
}
