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
  | { ok: false; reason: "checkpoint_not_found" };

/**
 * Restore a checkpoint: write its captured definition as the workflow's new
 * draft. The caller (route) has already authorized the member against
 * `workflow.accountId` and supplies the loaded record. We re-read the
 * checkpoint scoped to the workflow id (so a checkpoint id from another
 * workflow is never restorable here), then go through `saveDraftDefinition`
 * so the active-trigger-change deactivation rule applies identically to a
 * normal draft save.
 */
export async function restoreCheckpoint(input: {
  workflow: WorkflowRecord;
  checkpointId: string;
}): Promise<RestoreCheckpointResult> {
  const checkpoint = await checkpointsRepo.getByIdForWorkflow(
    input.checkpointId,
    input.workflow.id,
  );
  if (!checkpoint) return { ok: false, reason: "checkpoint_not_found" };

  const saved = await saveDraftDefinition({
    previousState: input.workflow.state,
    previousDefinition: input.workflow.draftDefinition,
    nextDefinition: checkpoint.definition,
    write: () =>
      workflowsRepo.updateDraftDefinition(input.workflow.id, checkpoint.definition),
  });
  // Unguarded write never returns null; fall back to the loaded record defensively.
  return { ok: true, record: saved ?? input.workflow };
}
