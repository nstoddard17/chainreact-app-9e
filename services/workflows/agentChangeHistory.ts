import {
  AGENT_CHANGE_NEW_STATUSES,
  AGENT_CHANGE_PROMPT_MAX,
  AGENT_CHANGE_REASON_MAX,
  AGENT_CHANGE_REF_MAX,
  AGENT_CHANGE_SUMMARY_MAX,
  AGENT_CHANGE_TITLE_MAX,
  type AgentChangeHistoryItem,
  type AgentChangeStatus,
  type RecordAgentChangeRequest,
} from "@/contracts/agentChangeHistory";
import * as historyRepo from "@/repositories/agentChangeHistory";
import type { AgentChangeHistoryRecord } from "@/repositories/agentChangeHistory";

/**
 * Agent change history service (AGENT-CHANGE-HISTORY-1) — orchestration for the
 * user-visible React Agent activity timeline.
 *
 * Authorization (account membership) is enforced by the route BEFORE these
 * functions run (loadWorkflowForMember); the service receives an already-
 * authorized workflow + account context and owns the orchestration:
 *   - record: clamp the value-free fields, then CREATE a new item (preview shown
 *     / checkpoint restored) or TRANSITION the existing item (applied / discarded
 *     / undone / failed) in place, preserving the preview-time prompt + counts.
 *   - list: project repo rows to the safe DTO.
 *
 * Privacy: the service never persists config values / before-after values / raw
 * patches / secrets — the contract does not even accept them. `prompt` is the
 * member's own request text (mirrors workflow_checkpoints.prompt); title/summary
 * are the secret-scrubbed descriptions already shown in the live preview. All
 * free-text is clamped to the column caps; counts are clamped non-negative.
 */

/** Keep at most this many history rows per workflow (prune older on create). */
const MAX_HISTORY_PER_WORKFLOW = 20;

function isNewStatus(status: AgentChangeStatus): boolean {
  return (AGENT_CHANGE_NEW_STATUSES as readonly string[]).includes(status);
}

function clampText(value: string | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function clampCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function toDto(record: AgentChangeHistoryRecord): AgentChangeHistoryItem {
  return {
    id: record.id,
    agentChangeId: record.agentChangeId,
    workflowId: record.workflowId,
    source: record.source,
    status: record.status,
    prompt: record.prompt,
    title: record.title,
    summary: record.summary,
    changedNodeCount: record.changedNodeCount,
    addedNodeCount: record.addedNodeCount,
    removedNodeCount: record.removedNodeCount,
    changedConfigCount: record.changedConfigCount,
    setupIssueCount: record.setupIssueCount,
    previewPatchRef: record.previewPatchRef,
    checkpointId: record.checkpointId,
    runId: record.runId,
    failureReason: record.failureReason,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface RecordAgentChangeInput {
  workflowId: string;
  accountId: string;
  createdByUserId: string;
  request: RecordAgentChangeRequest;
}

export async function recordAgentChange(
  input: RecordAgentChangeInput,
): Promise<AgentChangeHistoryItem> {
  const { request } = input;
  const checkpointId = request.checkpointId ?? null;
  const runId = request.runId ?? null;
  const failureReason = clampText(request.failureReason, AGENT_CHANGE_REASON_MAX);

  // Transition path: update the row that shares this agent_change_id in place,
  // preserving the prompt/title/summary/counts captured at preview_created. Only
  // the new status + explicitly-supplied refs are written.
  if (!isNewStatus(request.status)) {
    const updated = await historyRepo.updateStatusByAgentChangeId({
      agentChangeId: request.agentChangeId,
      workflowId: input.workflowId,
      status: request.status,
      checkpointId,
      runId,
      failureReason,
    });
    if (updated) {
      // A transition should never grow the table, but prune defensively (cheap, best-effort).
      await pruneQuietly(input.workflowId);
      return toDto(updated);
    }
    // No prior preview_created row (e.g. event arrived out of order) — fall
    // through and create a minimal row carrying whatever the client supplied.
  }

  const created = await historyRepo.create({
    agentChangeId: request.agentChangeId,
    workflowId: input.workflowId,
    accountId: input.accountId,
    createdByUserId: input.createdByUserId,
    status: request.status,
    prompt: clampText(request.prompt, AGENT_CHANGE_PROMPT_MAX),
    title: clampText(request.title, AGENT_CHANGE_TITLE_MAX),
    summary: clampText(request.summary, AGENT_CHANGE_SUMMARY_MAX),
    changedNodeCount: clampCount(request.changedNodeCount),
    addedNodeCount: clampCount(request.addedNodeCount),
    removedNodeCount: clampCount(request.removedNodeCount),
    changedConfigCount: clampCount(request.changedConfigCount),
    setupIssueCount: clampCount(request.setupIssueCount),
    previewPatchRef: clampText(request.previewPatchRef, AGENT_CHANGE_REF_MAX),
    checkpointId,
    runId,
    failureReason,
  });
  await pruneQuietly(input.workflowId);
  return toDto(created);
}

/** Best-effort prune — never fail the record because cleanup of old rows hit an error. */
async function pruneQuietly(workflowId: string): Promise<void> {
  try {
    await historyRepo.pruneToRecent(workflowId, MAX_HISTORY_PER_WORKFLOW);
  } catch {
    // swallow — the row was recorded; pruning is opportunistic.
  }
}

export async function listAgentChanges(
  workflowId: string,
): Promise<readonly AgentChangeHistoryItem[]> {
  const records = await historyRepo.listRecentByWorkflow(workflowId, {
    limit: MAX_HISTORY_PER_WORKFLOW,
  });
  return records.map(toDto);
}
