"use client";

import { useCallback, type ReactNode } from "react";
import type {
  CheckWorkflowReviewContext,
  CheckWorkflowSetupTarget,
} from "@/core/workflows/checkWorkflowReview";
import type { CanvasPreviewGraphNode } from "@/core/workflows/canvasPreviewEligibility";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { PreviewSetupFieldsByType } from "@/core/workflows/previewSetupFields";
import { useGraphSlice } from "../state/graphSlice";
import { useConfigSlice } from "../state/configSlice";
import { buildCheckReviewContext } from "../validation/buildCheckReviewContext";
import type { RequiredFieldsByType } from "../validation/collectBuilderValidationIssues";
import { BuilderNodeSetupCard } from "../panels/BuilderNodeSetupCard";

/**
 * Agent-rail wiring for the builder (extracted from `WorkflowBuilder` to keep that orchestrator small;
 * BUILDER-AGENT-RAIL-WIRING-EXTRACT). Behavior is byte-identical to the inline callbacks — this is a
 * pure code move, no state-ownership or contract change.
 *
 * Returns the three things `WorkflowBuilder` forwards to `BuilderGuidanceRail`:
 *   - `getCheckReviewContext` — the deterministic Check-workflow snapshot (verdict + setup targets),
 *     read from the graph store at call time (`getState()`, no subscription).
 *   - `getCurrentGraphShape` — the live draft graph shape (kind/provider/type only) for the
 *     "Show on canvas" same-shape guard.
 *   - `renderCheckSetup` — renders the existing-node setup card for the review's setup targets, wired to
 *     the deterministic update + config-panel reveal handlers below.
 *
 * Everything here is deterministic/local: NO model/Hermes/LLM call, NO save/activate/run, NO new nodes,
 * NO preview apply. The setup update writes the existing node via the normal `updateNodeConfig` (marks
 * the draft dirty) and syncs an open config panel via `applyExternalConfig`; field interaction reveals
 * + highlights the node via `revealNode` (navigation only).
 */
export interface UseAgentRailWiringInput {
  readonly requiredFieldsByType?: RequiredFieldsByType;
  readonly providerLabels: Readonly<Record<string, string>>;
  readonly setupFieldsByType?: PreviewSetupFieldsByType;
  readonly workflowId: string;
}

export interface AgentRailWiring {
  readonly getCheckReviewContext: () => CheckWorkflowReviewContext;
  readonly getCurrentGraphShape: () => readonly CanvasPreviewGraphNode[];
  /**
   * HERMES-AGENT-WORKFLOW-EDITOR — the user's CURRENT local draft (full nodes incl. ids + config, +
   * edges) sent with each guidance request so React can propose a catalog-validated edit against what's
   * on the canvas now. Read at call time from the graph store (no subscription). Config is the user's
   * own data; the SERVER redacts secrets before the model.
   */
  readonly getCurrentDraft: () => WorkflowDefinition;
  readonly renderCheckSetup: (targets: readonly CheckWorkflowSetupTarget[]) => ReactNode;
}

export function useAgentRailWiring({
  requiredFieldsByType,
  providerLabels,
  setupFieldsByType,
  workflowId,
}: UseAgentRailWiringInput): AgentRailWiring {
  const getCheckReviewContext = useCallback(
    () =>
      buildCheckReviewContext({
        pendingNodes: useGraphSlice.getState().pendingNodes,
        pendingEdges: useGraphSlice.getState().pendingEdges,
        ...(requiredFieldsByType ? { requiredFieldsByType } : {}),
        providerLabels,
      }),
    [requiredFieldsByType, providerLabels],
  );

  const getCurrentGraphShape = useCallback(
    () =>
      useGraphSlice
        .getState()
        .pendingNodes.map((n) => ({ kind: n.kind, provider: n.provider, type: n.type })),
    [],
  );

  // HERMES-AGENT-WORKFLOW-EDITOR — the full current local draft (stable ids + config + edges) for the
  // conversational-editor request. Read fresh at call time; never subscribes.
  const getCurrentDraft = useCallback((): WorkflowDefinition => {
    const s = useGraphSlice.getState();
    return { nodes: [...s.pendingNodes], edges: [...s.pendingEdges] };
  }, []);

  const handleUpdateStepSetup = useCallback(
    (nodeId: string, values: Record<string, unknown>) => {
      if (Object.keys(values).length === 0) return;
      const state = useGraphSlice.getState();
      const current = state.pendingNodes.find((n) => n.id === nodeId);
      if (!current) return;
      state.updateNodeConfig(nodeId, { ...current.config, ...values });
      // Keep an OPEN config panel for this node in sync so the visible field isn't stale. No-op closed.
      useConfigSlice.getState().applyExternalConfig({ nodeId, values });
    },
    [],
  );

  const handleSetupFieldReveal = useCallback((nodeId: string, fieldName: string) => {
    const current = useGraphSlice.getState().pendingNodes.find((n) => n.id === nodeId);
    if (!current) return;
    useConfigSlice.getState().revealNode({ nodeId, initialValues: current.config, fieldKey: fieldName });
  }, []);

  const renderCheckSetup = useCallback(
    (targets: readonly CheckWorkflowSetupTarget[]) => (
      <BuilderNodeSetupCard
        nodes={targets}
        {...(setupFieldsByType ? { setupFieldsByType } : {})}
        workflowId={workflowId}
        onUpdateStep={handleUpdateStepSetup}
        onFieldInteract={handleSetupFieldReveal}
      />
    ),
    [setupFieldsByType, workflowId, handleUpdateStepSetup, handleSetupFieldReveal],
  );

  return { getCheckReviewContext, getCurrentGraphShape, getCurrentDraft, renderCheckSetup };
}
