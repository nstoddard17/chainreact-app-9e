import { createClient } from "@/utils/supabase/server";
import type {
  WorkflowCheckpointSource,
} from "@/contracts/workflowCheckpoint";
import type { WorkflowDefinition } from "@/contracts/workflow";

/**
 * Repository for workflow_checkpoints (CHECKPOINTS-1).
 *
 * Per docs/rules/database-security.md + project-structure rule: server-side
 * only, DB access only — no business rules, no auth decisions (the service /
 * route owns membership authorization; RLS is the backstop). Mirrors the
 * patterns in repositories/workflows.ts.
 */

/** Full row including the (potentially large) draft snapshot. Used by restore. */
export interface WorkflowCheckpointRecord {
  id: string;
  workflowId: string;
  accountId: string;
  createdByUserId: string | null;
  source: WorkflowCheckpointSource;
  name: string;
  prompt: string | null;
  summary: string | null;
  definition: WorkflowDefinition;
  createdAt: string;
}

/** Metadata projection (no `definition`) for the recent-checkpoints list. */
export type WorkflowCheckpointMetaRecord = Omit<WorkflowCheckpointRecord, "definition">;

interface WorkflowCheckpointsRow {
  id: string;
  workflow_id: string;
  account_id: string;
  created_by_user_id: string | null;
  source: WorkflowCheckpointSource;
  name: string;
  prompt: string | null;
  summary: string | null;
  definition: unknown;
  created_at: string;
}

type WorkflowCheckpointsMetaRow = Omit<WorkflowCheckpointsRow, "definition">;

const META_COLUMNS =
  "id, workflow_id, account_id, created_by_user_id, source, name, prompt, summary, created_at";

function rowToRecord(row: WorkflowCheckpointsRow): WorkflowCheckpointRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    source: row.source,
    name: row.name,
    prompt: row.prompt,
    summary: row.summary,
    definition: (row.definition ?? { nodes: [], edges: [] }) as WorkflowDefinition,
    createdAt: row.created_at,
  };
}

function metaRowToRecord(row: WorkflowCheckpointsMetaRow): WorkflowCheckpointMetaRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    source: row.source,
    name: row.name,
    prompt: row.prompt,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

export interface CreateCheckpointInput {
  workflowId: string;
  accountId: string;
  createdByUserId: string;
  source: WorkflowCheckpointSource;
  name: string;
  prompt: string | null;
  summary: string | null;
  definition: WorkflowDefinition;
}

export async function create(
  input: CreateCheckpointInput,
): Promise<WorkflowCheckpointRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .insert({
      workflow_id: input.workflowId,
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      source: input.source,
      name: input.name,
      prompt: input.prompt,
      summary: input.summary,
      definition: input.definition,
    })
    .select("*")
    .single<WorkflowCheckpointsRow>();
  if (error || !data) {
    throw new Error(
      `workflow_checkpoints.create failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * Recent checkpoints for a workflow, newest first. Returns METADATA only (no
 * `definition`) — the list UI never needs the snapshot; restore reads it by id.
 * RLS scopes visibility to account members; the explicit `.eq("workflow_id")`
 * scopes the result set.
 */
export async function listRecentByWorkflow(
  workflowId: string,
  opts: { limit?: number } = {},
): Promise<readonly WorkflowCheckpointMetaRecord[]> {
  const supabase = await createClient();
  const limit = Math.min(opts.limit ?? 20, 50);
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .select(META_COLUMNS)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_checkpoints.listRecentByWorkflow failed: ${error.message}`);
  }
  return (data ?? []).map((r) => metaRowToRecord(r as WorkflowCheckpointsMetaRow));
}

/**
 * Fetch one checkpoint (WITH definition) scoped to its workflow. The
 * `.eq("workflow_id")` guard ensures a checkpoint id from a DIFFERENT workflow
 * is never read through this workflow's route. Returns null when absent.
 */
export async function getByIdForWorkflow(
  checkpointId: string,
  workflowId: string,
): Promise<WorkflowCheckpointRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .select("*")
    .eq("id", checkpointId)
    .eq("workflow_id", workflowId)
    .maybeSingle<WorkflowCheckpointsRow>();
  if (error) {
    throw new Error(`workflow_checkpoints.getByIdForWorkflow failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Prune to the most recent `keep` checkpoints for a workflow so an active
 * editing session can't grow the table unbounded. Deletes everything older than
 * the newest `keep`. No-op when at/under the cap. RLS gates the delete to account
 * members.
 */
export async function pruneToRecent(
  workflowId: string,
  keep: number,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .select("id")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .range(keep, keep + 999);
  if (error) {
    throw new Error(`workflow_checkpoints.pruneToRecent (select) failed: ${error.message}`);
  }
  const stale = (data ?? []).map((r) => (r as { id: string }).id);
  if (stale.length === 0) return;
  const { error: delError } = await supabase
    .from("workflow_checkpoints")
    .delete()
    .in("id", stale);
  if (delError) {
    throw new Error(`workflow_checkpoints.pruneToRecent (delete) failed: ${delError.message}`);
  }
}
