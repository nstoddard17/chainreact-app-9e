import type { WorkflowDefinition } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowRecord } from "@/repositories/workflows";
import { isActiveRevisionExecutionEnabled } from "@/services/workflows/flags";

/**
 * Active-revision read/write foundation (V2-READY-41B).
 *
 * Product rule (V2-READY-41A, approved): the draft is the mutable editing state;
 * the active revision is the immutable live-execution state. This module is the
 * single seam for:
 *   - reading the definition the runtime should execute (`getActiveDefinition`),
 *     explicit about whether it returned the draft or the active revision; and
 *   - snapshotting the current draft into an immutable revision at activation
 *     (`snapshotActiveRevision`).
 *
 * 41B is foundation only. Execution consumes `getActiveDefinition` behind the
 * `ENABLE_ACTIVE_REVISION_EXECUTION` flag (default OFF; see
 * services/workflows/flags.ts). Trigger registration and the builder Publish UX
 * are NOT switched in this slice.
 */

export type DefinitionSource = "draft" | "active_revision";

export interface ResolvedDefinition {
  /** The definition the caller should use. */
  definition: WorkflowDefinition;
  /** Which storage the definition came from — callers must not have to guess. */
  source: DefinitionSource;
  /** The revision id when `source === "active_revision"`; null for draft. */
  revisionId: string | null;
}

/**
 * Resolve the definition the RUNTIME should execute for a workflow.
 *
 * - No `active_revision_id` (legacy workflow, or a freshly-activated workflow
 *   whose best-effort snapshot has not landed): returns the draft, `source:
 *   "draft"`. This is the safe fallback that keeps behavior identical to the
 *   pre-41B model.
 * - `active_revision_id` present but the revision row is missing (not expected —
 *   the FK is `ON DELETE SET NULL`): logs a structured warning (workflow id
 *   only, no graph / account / token detail) and falls back to the draft.
 * - Otherwise returns the immutable revision definition, `source:
 *   "active_revision"`. Because the revision is frozen at snapshot time, later
 *   draft edits do NOT change what this returns — that immutability is the
 *   whole point.
 *
 * Service-role read (the execution context has no user session); does NOT
 * mutate anything.
 */
export async function getActiveDefinition(
  workflow: WorkflowRecord,
): Promise<ResolvedDefinition> {
  if (!workflow.activeRevisionId) {
    return { definition: workflow.draftDefinition, source: "draft", revisionId: null };
  }

  const revision = await workflowsRepo.getRevisionByIdServiceRole(
    workflow.activeRevisionId,
  );
  if (!revision) {
    // Dangling pointer — should not happen given the FK. Fail safe to draft so a
    // run never crashes on a missing revision. No leak: workflow id only.
    console.warn(
      JSON.stringify({
        event: "workflow.active_revision.missing",
        workflowId: workflow.id,
      }),
    );
    return { definition: workflow.draftDefinition, source: "draft", revisionId: null };
  }

  return {
    definition: revision.definition,
    source: "active_revision",
    revisionId: revision.id,
  };
}

/**
 * Flag-gated entry point for the EXECUTION engine (V2-READY-41B).
 *
 * - `ENABLE_ACTIVE_REVISION_EXECUTION` OFF (default): returns the draft WITHOUT
 *   reading any revision — byte-identical to the pre-41B execution path.
 * - ON: delegates to `getActiveDefinition` (active revision, with the safe draft
 *   fallback for null / dangling pointers).
 *
 * Keeping the flag here (not in the engine) means the engine has a single,
 * stable call site and the rollout toggle lives with the rest of the
 * active-revision logic.
 */
export async function getDefinitionForExecution(
  workflow: WorkflowRecord,
): Promise<ResolvedDefinition> {
  if (!isActiveRevisionExecutionEnabled()) {
    return { definition: workflow.draftDefinition, source: "draft", revisionId: null };
  }
  return getActiveDefinition(workflow);
}

/**
 * Snapshot the workflow's CURRENT draft into a new immutable revision and point
 * `active_revision_id` at it. Called at activation time (and resume from
 * `eligible_to_resume`) by the lifecycle orchestrator.
 *
 * Ordering note (the orchestrator owns this): this runs only AFTER the state
 * transition to `active` has persisted, and is best-effort there — so a FAILED
 * activation (precondition / trigger-registration / persist failure) never
 * reaches this and therefore never creates a revision ("no bogus revision on
 * failed activation"). If this itself fails, the workflow stays active with
 * `active_revision_id = null`, which `getActiveDefinition` handles as the safe
 * draft fallback.
 *
 * Uses the RLS auth client (createRevision / setActiveRevision) — activation
 * runs inside the authenticated API request, so account-membership RLS gates
 * the writes correctly.
 */
export async function snapshotActiveRevision(
  workflow: WorkflowRecord,
): Promise<WorkflowRecord> {
  const revision = await workflowsRepo.createRevision({
    workflowId: workflow.id,
    definition: workflow.draftDefinition,
  });
  return workflowsRepo.setActiveRevision(workflow.id, revision.id);
}
