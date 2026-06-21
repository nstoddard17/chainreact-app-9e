/**
 * Ephemeral, NON-APPLIED workflow draft preview (HERMES-AGENT-DRAFT-PREVIEW).
 *
 * A `DraftPreview` is a READ-ONLY, in-memory rendering of a capability-validated `WorkflowPlan` — a
 * visual/textual sketch the user can inspect. It is deliberately a DISTINCT type from the persisted
 * `WorkflowDefinition` / `draftDefinition` so it can NEVER be accidentally saved, applied, run, or fed
 * to the builder/apply pipeline:
 *   - ids are PREVIEW-ONLY (`preview-step-1`, `preview-edge-1`) — never real workflow/node/db ids;
 *   - nodes carry capability LABELS only (`provider`/`type` from the validated plan) — never config
 *     values, credentials, field mappings, resolved `{{...}}` variables, or provider account ids;
 *   - `notApplied: true` is stamped on the preview AND every node/edge;
 *   - missing/unresolved info is surfaced as plain-text `warnings` / `missingInputs` (field KEY names
 *     only), never as executable config.
 *
 * Converting a plan to a preview changes NOTHING. There is no apply/create/add/run path in this slice;
 * a future explicit, user-initiated action would hand the validated plan to the deterministic builder.
 */

import type { WorkflowPlanStepRole } from "./guidanceSession";

export const WORKFLOW_PLAN_PREVIEW_VERSION = 1 as const;

/** The fixed, user-facing review copy. The UI renders this verbatim. */
export const DRAFT_PREVIEW_NOTICE = "Preview only — your workflow has not changed." as const;

/** A preview node — a sketch of one plan step. Labels only; no executable config. */
export interface DraftPreviewNode {
  /** Preview-only id, e.g. "preview-step-1". NEVER a real workflow/node/db id. */
  readonly previewId: string;
  readonly role: WorkflowPlanStepRole;
  /** Validated capability provider label (e.g. "gmail"). Display only. */
  readonly provider: string;
  /** Validated capability type label (e.g. "new_email"). Display only. */
  readonly type: string;
  /** Human label — `${provider}:${type}` (or the step purpose for provider-less logic steps). */
  readonly label: string;
  /** Plain-English purpose of the step. No config values. */
  readonly purpose: string;
  /** Field KEY names the user would still need to provide — labels only, never values. */
  readonly missingInputs?: readonly string[];
  /** ALWAYS true — a preview node is not a real, applied node. */
  readonly notApplied: true;
}

/** A preview edge — sequence between two preview nodes. */
export interface DraftPreviewEdge {
  /** Preview-only id, e.g. "preview-edge-1". */
  readonly previewId: string;
  readonly fromPreviewId: string;
  readonly toPreviewId: string;
  /** ALWAYS true — a preview edge is not a real, applied edge. */
  readonly notApplied: true;
}

/** The ephemeral preview surfaced to the user. NOT a persisted workflow definition. */
export interface DraftPreview {
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly nodes: readonly DraftPreviewNode[];
  readonly edges: readonly DraftPreviewEdge[];
  /** Non-actionable notes (e.g. "Step 2 (slack:send_message) still needs: channel"). */
  readonly warnings?: readonly string[];
  /** Fixed review copy ({@link DRAFT_PREVIEW_NOTICE}). */
  readonly notice: typeof DRAFT_PREVIEW_NOTICE;
  /** ALWAYS true — preview only; nothing applied / saved / run / inserted. */
  readonly notApplied: true;
}

/**
 * Deterministic ADDITIVE builder patch (HERMES-AGENT-APPLY-PREVIEW-PATCH).
 *
 * The shape the builder applies to its LOCAL draft graph when the user explicitly clicks "Apply
 * preview". It is intentionally ADDITIVE-ONLY: `addNode` + `addEdge` described declaratively. There
 * are deliberately NO delete / replace / update-config / replace-trigger / branch-rewrite operations
 * in this slice. Refs are patch-local handles (`p0`, `p1`, …) — the graph slice assigns REAL node/edge
 * ids on apply (so the patch itself stays deterministic and id-free). The patch is built from a
 * capability-VALIDATED `WorkflowPlan` (the source of truth), never from the display `DraftPreview`.
 *
 * `kind: "additive"` is a literal marker so callers/tests can assert the additive-only contract.
 */
export interface BuilderPatchNode {
  /** Patch-local handle (e.g. "p0"). NOT a real or preview id. */
  readonly ref: string;
  /** Builder node kind. Only trigger/action are representable (no "logic" graph kind in V2). */
  readonly kind: "trigger" | "action";
  /** Validated capability provider (registry-checked upstream). */
  readonly provider: string;
  /** Validated capability type (registry-checked upstream). */
  readonly type: string;
  /**
   * HERMES-AGENT-GUIDED-PREVIEW-SETUP-1 — optional seed config collected via guided setup controls on
   * the holographic preview (sanitized to supported, non-sensitive metadata keys only). Absent ⇒ the
   * node is created with EMPTY config (original behavior). Never contains secrets / async-resolver /
   * unknown keys (the producer sanitizes against the action/trigger metadata).
   */
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface BuilderPatchEdge {
  readonly fromRef: string;
  readonly toRef: string;
}

export interface BuilderPreviewPatch {
  /** Additive-only marker — this slice never deletes/replaces/updates existing graph pieces. */
  readonly kind: "additive";
  readonly nodes: readonly BuilderPatchNode[];
  readonly edges: readonly BuilderPatchEdge[];
}
