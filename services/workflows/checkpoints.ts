import type {
  WorkflowCheckpoint,
  WorkflowCheckpointSource,
} from "@/contracts/workflowCheckpoint";
import type { WorkflowDefinition } from "@/contracts/workflow";
import * as checkpointsRepo from "@/repositories/workflowCheckpoints";
import type {
  WorkflowCheckpointMetaRecord,
} from "@/repositories/workflowCheckpoints";
import * as workflowsRepo from "@/repositories/workflows";
import type { WorkflowRecord } from "@/repositories/workflows";
import { saveDraftDefinition } from "@/services/workflows/saveDraftDefinition";

/**
 * Workflow checkpoints service (CHECKPOINTS-1) — orchestration for durable
 * draft restore points.
 *
 * Authorization (account membership) is enforced by the route BEFORE these
 * functions run (loadOrNotFound / requireWorkflowAccountMember); the service
 * receives an already-authorized workflow context and owns the orchestration:
 *   - create: persist the pre-change snapshot, then prune to a bounded recent set.
 *   - list: project repo rows to the safe metadata DTO.
 *   - restore: write the checkpoint's definition as the new draft via the
 *     SHARED saveDraftDefinition path, so an active-trigger change deactivates
 *     exactly as a normal save would (Reactivate → Resume recovery).
 */

/** Keep at most this many checkpoints per workflow (prune older on create). */
const MAX_CHECKPOINTS_PER_WORKFLOW = 20;

function toDto(
  record: WorkflowCheckpointMetaRecord,
): WorkflowCheckpoint {
  return {
    id: record.id,
    workflowId: record.workflowId,
    source: record.source,
    name: record.name,
    prompt: record.prompt,
    summary: record.summary,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
  };
}

export interface CreateCheckpointInput {
  workflowId: string;
  accountId: string;
  createdByUserId: string;
  source: WorkflowCheckpointSource;
  name: string;
  prompt?: string;
  summary?: string;
  /** The PRE-change draft snapshot to restore to. */
  definition: WorkflowDefinition;
}

export async function createCheckpoint(
  input: CreateCheckpointInput,
): Promise<WorkflowCheckpoint> {
  const record = await checkpointsRepo.create({
    workflowId: input.workflowId,
    accountId: input.accountId,
    createdByUserId: input.createdByUserId,
    source: input.source,
    name: input.name,
    prompt: input.prompt ?? null,
    summary: input.summary ?? null,
    definition: input.definition,
  });
  // Best-effort prune — never fail the create because cleanup of old rows hit
  // an error; the cap is a guard against unbounded growth, not a correctness
  // invariant.
  try {
    await checkpointsRepo.pruneToRecent(input.workflowId, MAX_CHECKPOINTS_PER_WORKFLOW);
  } catch {
    // swallow — the checkpoint was created; pruning is opportunistic.
  }
  // create() returns the full record (with definition); project to the safe DTO.
  return toDto({
    id: record.id,
    workflowId: record.workflowId,
    accountId: record.accountId,
    createdByUserId: record.createdByUserId,
    source: record.source,
    name: record.name,
    prompt: record.prompt,
    summary: record.summary,
    createdAt: record.createdAt,
  });
}

export async function listCheckpoints(
  workflowId: string,
): Promise<readonly WorkflowCheckpoint[]> {
  const records = await checkpointsRepo.listRecentByWorkflow(workflowId, {
    limit: MAX_CHECKPOINTS_PER_WORKFLOW,
  });
  return records.map(toDto);
}

export type RestoreCheckpointResult =
  | { ok: true; record: WorkflowRecord }
  | { ok: false; reason: "checkpoint_not_found" }
  /** WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — the workflow moved past
   *  the revision the caller loaded; nothing was restored, no side effect ran. */
  | { ok: false; reason: "revision_conflict"; latestRevision: string };

/**
 * Restore a checkpoint: write its captured definition as the workflow's new
 * draft. The caller (route) has already authorized the member against
 * `workflow.accountId` and supplies the loaded record. We re-read the
 * checkpoint scoped to the workflow id (so a checkpoint id from another
 * workflow is never restorable here), then go through `saveDraftDefinition`
 * so the active-trigger-change deactivation rule applies identically to a
 * normal draft save.
 *
 * WORKFLOW-CHANGED-ELSEWHERE-CONFLICT-PROTECTION-1 — a restore is an
 * authoritative definition save, so it follows the same compare-and-swap
 * contract: `expectedRevision` is the revision the caller's builder session
 * loaded, and a stale session gets a typed conflict instead of clobbering a
 * newer draft another session just saved.
 */
export async function restoreCheckpoint(input: {
  workflow: WorkflowRecord;
  checkpointId: string;
  expectedRevision: string;
}): Promise<RestoreCheckpointResult> {
  if (input.workflow.updatedAt !== input.expectedRevision) {
    return {
      ok: false,
      reason: "revision_conflict",
      latestRevision: input.workflow.updatedAt,
    };
  }
  const checkpoint = await checkpointsRepo.getByIdForWorkflow(
    input.checkpointId,
    input.workflow.id,
  );
  if (!checkpoint) return { ok: false, reason: "checkpoint_not_found" };

  const saved = await saveDraftDefinition({
    accountId: input.workflow.accountId,
    previousState: input.workflow.state,
    previousDefinition: input.workflow.draftDefinition,
    nextDefinition: checkpoint.definition,
    write: () =>
      workflowsRepo.updateDraftDefinitionIfRevisionMatches({
        accountId: input.workflow.accountId,
        workflowId: input.workflow.id,
        draftDefinition: checkpoint.definition,
        expectedUpdatedAt: input.expectedRevision,
      }),
  });
  if (!saved) {
    // CAS missed between the route's load and the UPDATE: nothing was written,
    // nothing deactivated. Re-read for the current token (fall back to the
    // loaded record's if the row vanished — route maps by reason, not record).
    const current = await workflowsRepo.getById(input.workflow.id);
    return {
      ok: false,
      reason: "revision_conflict",
      latestRevision: current?.updatedAt ?? input.workflow.updatedAt,
    };
  }
  return { ok: true, record: saved };
}
