import type { WorkflowEdge, WorkflowNode } from "@/contracts/workflow";
import { buildRequiredFieldsByType } from "@/core/workflows/requiredFields";
import {
  evaluateExecutionReadiness,
  toReadinessError,
  type ReadinessError,
} from "@/core/workflows/executionReadiness";
import {
  listAllActionMetas,
  listAllTriggerMetas,
} from "@/services/discovery/_registry";

/**
 * Server-side execution-readiness gate (B).
 *
 * Builds the metadata-derived required-field lookup from the discovery registry
 * and runs the shared `core/workflows` validator (graph integrity + required
 * fields). Returns a typed `ReadinessError` for the route/engine to surface, or
 * `null` when the workflow is runnable.
 *
 * Used by every server execution entry point so they share one verdict:
 *   - Run-Manually preflight (synchronous 422)
 *   - Activate gate (synchronous 422)
 *   - Engine pre-dispatch (records a standardized failed run — the universal
 *     backstop for webhook / scheduled / any path that reaches the engine)
 */
export function checkWorkflowReadiness(def: {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}): ReadinessError | null {
  const requiredFieldsByType = buildRequiredFieldsByType(
    listAllActionMetas(),
    listAllTriggerMetas(),
  );
  const result = evaluateExecutionReadiness({
    nodes: def.nodes,
    edges: def.edges,
    requiredFieldsByType,
  });
  return toReadinessError(result);
}
