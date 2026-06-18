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
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";

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

/**
 * Broken (deleted-/unknown-node) variable reference verdict — the write-path-only
 * extension of the shared readiness gate (AI-READINESS-CONVERGENCE CS-2).
 *
 * No-leak: carries only the INTERNAL node id + the config KEY name per broken ref —
 * never a config VALUE and never the raw `{{...}}` template string. Mirrors the
 * structural `ReadinessError` envelope shape so the routes serialize it the same way.
 */
export interface InvalidVariableReferenceReadinessError {
  readonly error: "INVALID_VARIABLE_REFERENCE";
  readonly message: string;
  /** Per broken reference: internal node id + the config field key (no value, no token). */
  readonly references: readonly { readonly nodeId: string; readonly fieldKey: string }[];
}

export type WritePathReadinessError = ReadinessError | InvalidVariableReferenceReadinessError;

/**
 * WRITE-PATH readiness gate for ACTIVATE + PUBLISH — the two moments a draft becomes
 * the live definition (AI-READINESS-CONVERGENCE CS-2).
 *
 * Stricter than the runtime gate (`checkWorkflowReadiness`): in addition to the shared
 * structural/field verdict (graph integrity incl. self-loops from CS-1, required
 * fields), it rejects a draft whose config still references a deleted/unknown step
 * (`INVALID_VARIABLE_REFERENCE`) — which Check already flags and which would fail at
 * variable-resolution time once live.
 *
 * DELIBERATELY NOT wired into engine pre-dispatch / run-now (the hot path): it is a
 * per-node config-string scan, and an ALREADY-LIVE definition that contains a dangling
 * reference must keep running (it fails at resolution time, as today) — never
 * retroactively killed. Only the Activate + Publish routes (which validate the DRAFT
 * about to go live) call this; existing active revisions are untouched.
 *
 * Precedence: structural/field first (reuses `checkWorkflowReadiness`), then invalid
 * references — so the most fundamental problem is surfaced first.
 */
export function checkWritePathReadiness(def: {
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}): WritePathReadinessError | null {
  const structural = checkWorkflowReadiness(def);
  if (structural) return structural;

  const broken = findInvalidVariableReferences(def.nodes);
  if (broken.length > 0) {
    const message =
      broken.length === 1
        ? "A step references a deleted or missing step. Fix the broken reference before going live."
        : `${broken.length} steps reference a deleted or missing step. Fix the broken references before going live.`;
    return {
      error: "INVALID_VARIABLE_REFERENCE",
      message,
      references: broken.map((r) => ({ nodeId: r.nodeId, fieldKey: r.fieldKey })),
    };
  }
  return null;
}
