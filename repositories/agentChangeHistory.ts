import { createClient } from "@/utils/supabase/server";
import type {
  AgentChangeSource,
  AgentChangeStatus,
} from "@/contracts/agentChangeHistory";

/**
 * Repository for agent_change_history (AGENT-CHANGE-HISTORY-1).
 *
 * Per docs/rules/database-security.md + project-structure rule: server-side
 * only, DB access only — no business rules, no auth decisions (the service /
 * route owns membership authorization; RLS is the backstop). Writes go through
 * the SSR-cookie client so RLS gates them to the authenticated member — mirrors
 * repositories/workflowCheckpoints.ts (this is user-created activity, NOT the
 * service-role-only governance audit ledger).
 */

export interface AgentChangeHistoryRecord {
  id: string;
  agentChangeId: string;
  workflowId: string;
  accountId: string;
  createdByUserId: string | null;
  source: AgentChangeSource;
  status: AgentChangeStatus;
  prompt: string | null;
  title: string | null;
  summary: string | null;
  changedNodeCount: number;
  addedNodeCount: number;
  removedNodeCount: number;
  changedConfigCount: number;
  setupIssueCount: number;
  previewPatchRef: string | null;
  checkpointId: string | null;
  runId: string | null;
  failureReason: string | null;
  diff: Record<string, unknown> | null;
  aiCostEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentChangeHistoryRow {
  id: string;
  agent_change_id: string;
  workflow_id: string;
  account_id: string;
  created_by_user_id: string | null;
  source: AgentChangeSource;
  status: AgentChangeStatus;
  prompt: string | null;
  title: string | null;
  summary: string | null;
  changed_node_count: number;
  added_node_count: number;
  removed_node_count: number;
  changed_config_count: number;
  setup_issue_count: number;
  preview_patch_ref: string | null;
  checkpoint_id: string | null;
  run_id: string | null;
  failure_reason: string | null;
  diff: Record<string, unknown> | null;
  ai_cost_event_id: string | null;
  created_at: string;
  updated_at: string;
}

// Single string LITERAL (not a `+` concatenation) so supabase-js can parse the
// column list into the row type — a widened `string` falls back to its error type.
const COLUMNS =
  "id, agent_change_id, workflow_id, account_id, created_by_user_id, source, status, prompt, title, summary, changed_node_count, added_node_count, removed_node_count, changed_config_count, setup_issue_count, preview_patch_ref, checkpoint_id, run_id, failure_reason, diff, ai_cost_event_id, created_at, updated_at";

function rowToRecord(row: AgentChangeHistoryRow): AgentChangeHistoryRecord {
  return {
    id: row.id,
    agentChangeId: row.agent_change_id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    source: row.source,
    status: row.status,
    prompt: row.prompt,
    title: row.title,
    summary: row.summary,
    changedNodeCount: row.changed_node_count,
    addedNodeCount: row.added_node_count,
    removedNodeCount: row.removed_node_count,
    changedConfigCount: row.changed_config_count,
    setupIssueCount: row.setup_issue_count,
    previewPatchRef: row.preview_patch_ref,
    checkpointId: row.checkpoint_id,
    runId: row.run_id,
    failureReason: row.failure_reason,
    diff: row.diff,
    aiCostEventId: row.ai_cost_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateAgentChangeInput {
  agentChangeId: string;
  workflowId: string;
  accountId: string;
  createdByUserId: string;
  status: AgentChangeStatus;
  prompt: string | null;
  title: string | null;
  summary: string | null;
  changedNodeCount: number;
  addedNodeCount: number;
  removedNodeCount: number;
  changedConfigCount: number;
  setupIssueCount: number;
  previewPatchRef: string | null;
  checkpointId: string | null;
  runId: string | null;
  failureReason: string | null;
  diff: Record<string, unknown> | null;
  aiCostEventId: string | null;
}

/** Insert a new history row (preview_created / restored_checkpoint, or a transition with no prior row). */
export async function create(
  input: CreateAgentChangeInput,
): Promise<AgentChangeHistoryRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_change_history")
    .insert({
      agent_change_id: input.agentChangeId,
      workflow_id: input.workflowId,
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      source: "react_agent",
      status: input.status,
      prompt: input.prompt,
      title: input.title,
      summary: input.summary,
      changed_node_count: input.changedNodeCount,
      added_node_count: input.addedNodeCount,
      removed_node_count: input.removedNodeCount,
      changed_config_count: input.changedConfigCount,
      setup_issue_count: input.setupIssueCount,
      preview_patch_ref: input.previewPatchRef,
      checkpoint_id: input.checkpointId,
      run_id: input.runId,
      failure_reason: input.failureReason,
      diff: input.diff,
      ai_cost_event_id: input.aiCostEventId,
    })
    .select(COLUMNS)
    .single<AgentChangeHistoryRow>();
  if (error || !data) {
    throw new Error(
      `agent_change_history.create failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

export interface TransitionAgentChangeInput {
  agentChangeId: string;
  workflowId: string;
  status: AgentChangeStatus;
  /** Only set columns that are provided (preview-created fields are preserved). */
  checkpointId?: string | null;
  runId?: string | null;
  failureReason?: string | null;
  diff?: Record<string, unknown> | null;
  aiCostEventId?: string | null;
}

/**
 * Transition an EXISTING row (matched by workflow_id + agent_change_id) to a new
 * status, preserving the prompt/title/summary/counts captured at preview_created.
 * Only `status` + `updated_at` + explicitly-provided refs are written. Returns
 * null when no matching row exists (the caller then inserts a minimal row).
 */
export async function updateStatusByAgentChangeId(
  input: TransitionAgentChangeInput,
): Promise<AgentChangeHistoryRecord | null> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.checkpointId !== undefined) patch.checkpoint_id = input.checkpointId;
  if (input.runId !== undefined) patch.run_id = input.runId;
  if (input.failureReason !== undefined) patch.failure_reason = input.failureReason;
  if (input.diff !== undefined) patch.diff = input.diff;
  if (input.aiCostEventId !== undefined) patch.ai_cost_event_id = input.aiCostEventId;

  const { data, error } = await supabase
    .from("agent_change_history")
    .update(patch)
    .eq("workflow_id", input.workflowId)
    .eq("agent_change_id", input.agentChangeId)
    .select(COLUMNS)
    .maybeSingle<AgentChangeHistoryRow>();
  if (error) {
    throw new Error(
      `agent_change_history.updateStatusByAgentChangeId failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Recent change history for a workflow, newest first. RLS scopes visibility to
 * account members; the explicit `.eq("workflow_id")` scopes the result set.
 */
export async function listRecentByWorkflow(
  workflowId: string,
  opts: { limit?: number } = {},
): Promise<readonly AgentChangeHistoryRecord[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 20, 50);
  const { data, error } = await supabase
    .from("agent_change_history")
    .select(COLUMNS)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`agent_change_history.listRecentByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as AgentChangeHistoryRow));
}

/**
 * Prune to the most recent `keep` rows for a workflow so an active editing
 * session can't grow the table unbounded. No-op when at/under the cap. RLS gates
 * the delete to account members.
 */
export async function pruneToRecent(
  workflowId: string,
  keep: number,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_change_history")
    .select("id")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .range(keep, keep + 999);
  if (error) {
    throw new Error(`agent_change_history.pruneToRecent (select) failed: ${error.message}`);
  }
  const stale = (data ?? []).map((r) => (r as { id: string }).id);
  if (stale.length === 0) return;
  const { error: delError } = await supabase
    .from("agent_change_history")
    .delete()
    .in("id", stale);
  if (delError) {
    throw new Error(`agent_change_history.pruneToRecent (delete) failed: ${delError.message}`);
  }
}
