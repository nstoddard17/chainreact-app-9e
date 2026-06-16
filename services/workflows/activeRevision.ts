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

/**
 * V2-READY-41E — which definition an execution should run:
 *   - "live"  → the active revision when ENABLE_ACTIVE_REVISION_EXECUTION is ON
 *               (else the draft). The semantics of every production trigger
 *               path: manual run-now (real), scheduled, webhook, polling, public
 *               API trigger. Live execution must match what triggers fire.
 *   - "draft" → ALWAYS the mutable draft, regardless of the flag. The builder
 *               test / preview path — you preview what you're editing, no publish
 *               required.
 */
export type ExecutionDefinitionMode = "live" | "draft";

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
 * Flag-gated entry point for the EXECUTION engine (V2-READY-41B, mode added 41E).
 *
 * - `mode === "draft"` (builder test / preview): ALWAYS returns the draft, even
 *   when the flag is ON — preview reads what you're editing, no publish required.
 * - `mode === "live"` (default; all production trigger paths) + flag OFF: returns
 *   the draft — byte-identical to the pre-41B execution path.
 * - `mode === "live"` + flag ON: delegates to `getActiveDefinition` (active
 *   revision, with the safe draft fallback for null / dangling pointers).
 *
 * Keeping the flag + mode here (not in the engine) means the engine has a single,
 * stable call site and the rollout toggle lives with the rest of the
 * active-revision logic.
 */
export async function getDefinitionForExecution(
  workflow: WorkflowRecord,
  mode: ExecutionDefinitionMode = "live",
): Promise<ResolvedDefinition> {
  if (mode === "draft" || !isActiveRevisionExecutionEnabled()) {
    return { definition: workflow.draftDefinition, source: "draft", revisionId: null };
  }
  return getActiveDefinition(workflow);
}

/**
 * Create an immutable revision row from a supplied definition and return its id.
 * Called at activation / resume-from-eligible by the lifecycle orchestrator,
 * which passes the SAME definition it registered triggers from (V2-READY-41C) so
 * the revision and the registered trigger_resources are provably consistent.
 *
 * Does NOT set `active_revision_id` — the orchestrator does that atomically with
 * the state transition (`applyTransition({ activeRevisionId })`) so the workflow
 * never sits `active` without its revision pointer. Ordering / best-effort
 * semantics are the orchestrator's responsibility: it calls this only AFTER
 * trigger registration succeeds, and treats a throw here as "leave
 * active_revision_id null" (safe draft fallback) rather than failing activation.
 *
 * Uses the RLS auth client (createRevision) — activation runs inside the
 * authenticated API request, so account-membership RLS gates the INSERT.
 */
export async function createRevisionSnapshot(
  workflow: WorkflowRecord,
  definition: WorkflowDefinition,
): Promise<string> {
  const revision = await workflowsRepo.createRevision({
    workflowId: workflow.id,
    definition,
  });
  return revision.id;
}
