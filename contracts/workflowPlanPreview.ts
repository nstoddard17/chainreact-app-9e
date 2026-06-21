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
