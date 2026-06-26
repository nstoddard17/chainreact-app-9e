/**
 * Deterministic WorkflowDefinition → DraftPreview / WorkflowPlan (HERMES-AGENT-WORKFLOW-EDITOR).
 *
 * The general conversational-edit pipeline validates a `WorkflowPatch` against the user's CURRENT
 * local draft (`validateWorkflowPatch`) and gets back a `candidateDefinition` — the exact proposed
 * end-state graph. These pure transforms turn that candidate into:
 *   - a `DraftPreview` the canvas overlay renders (ghost nodes/edges, "needs setup" hints), and
 *   - a lightweight `WorkflowPlan` so the EXISTING auto-show machinery (meaningful-preview guard +
 *     signature dedup in `WorkflowGuidancePanel`) works unchanged.
 *
 * No-leak: carries provider/type LABELS, node/edge ids, and required field KEY names only — never
 * config VALUES, secrets, or resolved variables. The candidate's config (the user's own draft) is
 * NEVER surfaced here; only whether a registry-required field is still empty (→ "needs setup").
 * Pure + model-free.
 */

import { WORKFLOW_PLAN_SCHEMA_VERSION, type WorkflowPlan, type WorkflowPlanStep } from "@/contracts/guidanceSession";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import type { DraftPreview, DraftPreviewEdge, DraftPreviewNode } from "@/contracts/workflowPlanPreview";
import { DRAFT_PREVIEW_NOTICE, WORKFLOW_PLAN_PREVIEW_VERSION } from "@/contracts/workflowPlanPreview";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

/** Field KEY names a node still needs: registry-required fields whose value is absent/empty. Names only. */
function missingRequiredInputs(node: WorkflowDefinition["nodes"][number]): readonly string[] {
  const key = `${node.provider}:${node.type}`;
  const meta = node.kind === "trigger" ? getTriggerMeta(key) : getActionMeta(key);
  if (!meta) return [];
  return meta.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = node.config[f.name];
      return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
    })
    .map((f) => f.name);
}

/** Build the ephemeral, non-applied `DraftPreview` for a candidate definition (preview ids = real node ids). */
export function definitionToDraftPreview(def: WorkflowDefinition, title: string, summary: string): DraftPreview {
  const nodes: DraftPreviewNode[] = def.nodes.map((n) => {
    const missing = missingRequiredInputs(n);
    return {
      previewId: n.id,
      role: n.kind,
      provider: n.provider,
      type: n.type,
      label: `${n.provider}:${n.type}`,
      purpose: "",
      ...(missing.length > 0 ? { missingInputs: missing } : {}),
      notApplied: true,
    };
  });
  const edges: DraftPreviewEdge[] = def.edges.map((e) => ({
    previewId: e.id,
    fromPreviewId: e.from,
    toPreviewId: e.to,
    notApplied: true,
  }));
  return {
    version: WORKFLOW_PLAN_PREVIEW_VERSION,
    title: title.trim(),
    summary: summary.trim(),
    nodes,
    edges,
    notice: DRAFT_PREVIEW_NOTICE,
    notApplied: true,
  };
}

/**
 * Lightweight advisory plan mirroring a candidate definition's trigger/action steps — ONLY so the
 * existing auto-show guard (`isPlanMeaningfulCanvasPreview`) + signature dedup keep working. It is NOT
 * the apply source for a mutation (the apply uses the candidate definition directly). Ordered by a
 * shallow trigger→action traversal so the meaningful-shape comparison is stable.
 */
export function definitionToPlan(def: WorkflowDefinition, title: string, summary: string): WorkflowPlan {
  const steps: WorkflowPlanStep[] = def.nodes.map((n, i) => ({
    ref: n.id || `s${i}`,
    role: n.kind,
    provider: n.provider,
    type: n.type,
    purpose: "",
  }));
  return {
    schemaVersion: WORKFLOW_PLAN_SCHEMA_VERSION,
    title: title.trim(),
    summary: summary.trim(),
    steps,
    notApplied: true,
  };
}
