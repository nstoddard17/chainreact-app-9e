import type { WorkflowDefinition } from "@/contracts/workflow";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowRecord } from "@/repositories/workflows";
import { definitionsEqual } from "@/core/workflows/triggerChange";

/**
 * Active-revision read/write foundation (V2-READY-41B; enabled as the real
 * product model in V2-READY-41H).
 *
 * Product rule (V2-READY-41A, approved): the draft is the mutable editing state;
 * the active revision is the immutable live-execution state. This module is the
 * single seam for:
 *   - reading the definition the runtime should execute (`getActiveDefinition`),
 *     explicit about whether it returned the draft or the active revision; and
 *   - snapshotting the current draft into an immutable revision at activation
 *     (`snapshotActiveRevision`).
 *
 * V2-READY-41H removed the `ENABLE_ACTIVE_REVISION_EXECUTION` rollout flag:
 * `mode: "live"` now ALWAYS resolves the active revision (with the safe draft
 * fallback for null / dangling pointers baked into `getActiveDefinition`), and
 * `mode: "draft"` still ALWAYS returns the mutable draft for test / preview.
 */

export type DefinitionSource = "draft" | "active_revision";

/**
 * V2-READY-41E — which definition an execution should run (flag removed 41H):
 *   - "live"  → the active revision (with the safe draft fallback for null /
 *               dangling pointers). The semantics of every production trigger
 *               path: manual run-now (real), scheduled, webhook, polling, public
 *               API trigger. Live execution must match what triggers fire.
 *   - "draft" → ALWAYS the mutable draft. The builder test / preview path — you
 *               preview what you're editing, no publish required.
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
 * Entry point for the EXECUTION engine (V2-READY-41B, mode added 41E, flag
 * removed 41H).
 *
 * - `mode === "draft"` (builder test / preview): ALWAYS returns the draft —
 *   preview reads what you're editing, no publish required.
 * - `mode === "live"` (default; all production trigger paths — manual run-now,
 *   scheduled, webhook, polling, public API): delegates to `getActiveDefinition`
 *   (active revision, with the safe draft fallback for null / dangling pointers).
 *
 * Keeping the mode decision here (not in the engine) means the engine has a
 * single, stable call site and the active-revision logic lives in one place.
 */
export async function getDefinitionForExecution(
  workflow: WorkflowRecord,
  mode: ExecutionDefinitionMode = "live",
): Promise<ResolvedDefinition> {
  if (mode === "draft") {
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

/**
 * V2-READY-41F — has the workflow's draft drifted from its active revision?
 *
 * Returns true when:
 *   - there is no usable active revision (active_revision_id null, or it points at
 *     a missing row → getActiveDefinition falls back to "draft"); OR
 *   - the draft differs by value from the active revision's definition.
 *
 * Drives resume-from-paused: on drift, resume republishes (re-registers triggers
 * from the current draft + snapshots a new revision) instead of reusing stale
 * trigger_resources. Value comparison (definitionsEqual), not updated_at, so a
 * save that rewrote the row without changing content does not force a republish.
 *
 * Reads the revision via the service-role path inside getActiveDefinition — safe
 * here because resume runs server-side in the authenticated lifecycle request.
 */
export async function hasDraftDrift(workflow: WorkflowRecord): Promise<boolean> {
  const active = await getActiveDefinition(workflow);
  if (active.source !== "active_revision") return true;
  return !definitionsEqual(workflow.draftDefinition, active.definition);
}
