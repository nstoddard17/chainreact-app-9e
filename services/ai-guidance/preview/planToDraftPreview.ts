/**
 * Deterministic WorkflowPlan → DraftPreview conversion (HERMES-AGENT-DRAFT-PREVIEW).
 *
 * Turns a CAPABILITY-VALIDATED `WorkflowPlan` into an ephemeral, non-applied `DraftPreview` the UI can
 * render for review. This is a pure, model-free transform:
 *   - INPUT MUST ALREADY BE VALIDATED. The caller (route) only ever passes `result.workflowPlan`,
 *     which the normalizer sets exclusively after `validateWorkflowPlan` passes. This module does NOT
 *     re-run capability validation and is NOT a validation gate — it only converts.
 *   - It carries through provider/type LABELS only — never config, credentials, field mappings,
 *     resolved variables, secrets, or provider account ids (the plan never had those).
 *   - Missing field-key hints (`requiredInputs`) become plain-text `warnings` + per-node
 *     `missingInputs` — NEVER executable config.
 *   - Every node/edge and the preview itself are stamped `notApplied: true`, with PREVIEW-ONLY ids.
 *   - A plan that cannot be converted safely (no steps) → `null`.
 *
 * Converting changes NOTHING: it never creates, mutates, applies, or runs a workflow, never writes a
 * persisted definition, and never touches builder state. The output is a distinct preview type that
 * cannot be persisted as a workflow.
 */

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import type {
  DraftPreview,
  DraftPreviewEdge,
  DraftPreviewNode,
} from "@/contracts/workflowPlanPreview";
import {
  DRAFT_PREVIEW_NOTICE,
  WORKFLOW_PLAN_PREVIEW_VERSION,
} from "@/contracts/workflowPlanPreview";

/** Preview-only node id for the Nth (1-based) step. */
function previewStepId(index: number): string {
  return `preview-step-${index + 1}`;
}

/** Build a human label for a step: `provider:type`, or the purpose for a provider-less logic step. */
function nodeLabel(provider: string, type: string, purpose: string): string {
  const p = provider.trim();
  const t = type.trim();
  if (p && t) return `${p}:${t}`;
  if (t) return t;
  return purpose.trim() || "step";
}

/**
 * Convert a validated plan into a non-applied preview. Returns `null` (caller surfaces a safe warning)
 * when the plan has no steps to preview.
 */
export function planToDraftPreview(plan: WorkflowPlan | null | undefined): DraftPreview | null {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;

  const warnings: string[] = [];

  const nodes: DraftPreviewNode[] = plan.steps.map((step, i) => {
    const provider = (step.provider ?? "").trim();
    const type = (step.type ?? "").trim();
    const purpose = (step.purpose ?? "").trim();
    const label = nodeLabel(provider, type, purpose);
    const missing = step.requiredInputs?.filter((k: string) => typeof k === "string" && k.trim().length > 0);
    if (missing && missing.length > 0) {
      warnings.push(`Step ${i + 1} (${label}) still needs: ${missing.join(", ")}`);
    }
    return {
      previewId: previewStepId(i),
      role: step.role,
      provider,
      type,
      label,
      purpose,
      ...(missing && missing.length > 0 ? { missingInputs: missing } : {}),
      notApplied: true,
    };
  });

  // Steps are ordered; the preview shows a simple linear sequence (1 → 2 → 3 …). The advisory plan
  // does not carry explicit branch topology, so we never invent branching here.
  const edges: DraftPreviewEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      previewId: `preview-edge-${i + 1}`,
      fromPreviewId: nodes[i]!.previewId,
      toPreviewId: nodes[i + 1]!.previewId,
      notApplied: true,
    });
  }

  return {
    version: WORKFLOW_PLAN_PREVIEW_VERSION,
    title: (plan.title ?? "").trim(),
    summary: (plan.summary ?? "").trim(),
    nodes,
    edges,
    ...(warnings.length > 0 ? { warnings } : {}),
    notice: DRAFT_PREVIEW_NOTICE,
    notApplied: true,
  };
}
