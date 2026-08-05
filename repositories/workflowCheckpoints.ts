import { createClient } from "@/utils/supabase/server";
import { asTypedDb } from "./supabase/typedDb";
import { narrowColumn } from "@/core/database/columnNarrowing";
import { toJsonColumn } from "@/core/database/jsonColumn";
import { normalizePersistedWorkflowDefinition } from "@/contracts/workflowDefinition";
import type { TableColumns, TableInsert, TableRow } from "@/types/tables";
import {
  WORKFLOW_CHECKPOINT_SOURCES,
  type WorkflowCheckpointSource,
} from "@/contracts/workflowCheckpoint";
import type { WorkflowDefinition } from "@/contracts/workflow";

/**
 * Repository for workflow_checkpoints (CHECKPOINTS-1).
 *
 * Per docs/rules/database-security.md + project-structure rule: server-side
 * only, DB access only — no business rules, no auth decisions (the service /
 * route owns membership authorization; RLS is the backstop). Mirrors the
 * patterns in repositories/workflows.ts.
 *
 * TABLE TYPING (SUPABASE-TABLE-TYPING-1D) — and this file is where typing
 * found something real.
 *
 * `definition` USED TO BE CAST: `(row.definition ?? {nodes:[],edges:[]}) as
 * WorkflowDefinition`. Two failures in one expression. The cast asserted a
 * graph shape nothing had checked, and the `??` silently substituted an EMPTY
 * WORKFLOW for a missing snapshot. `restoreCheckpoint` writes this value back
 * as the workflow's new draft, so a corrupt checkpoint row could quietly
 * REPLACE a user's workflow with an empty canvas — through the same
 * compare-and-swap that exists to stop work being lost.
 *
 * It is now normalized through the SAME authoritative contract
 * `repositories/workflows.ts` already uses (`normalizePersistedWorkflowDefinition`
 * — no second schema), and the outcome is reported as `definitionInvalid`
 * rather than hidden. The repository still returns the row; refusing to
 * RESTORE an invalid one is the service's decision, and it makes it
 * (`services/workflows/checkpoints.ts`).
 *
 * `source` is CHECK-constrained text the generator can only call `string`, so
 * it is narrowed fail-closed against the contract's own constant set.
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
  /**
   * True when the persisted `definition` failed schema validation and
   * `definition` is the safe EMPTY fallback — same contract as
   * `WorkflowRecord.draftDefinitionInvalid`. A checkpoint flagged here is
   * NOT restorable: restoring it would overwrite a live workflow with an
   * empty canvas. Optional: absent ⇒ valid (rowToRecord always sets it;
   * hand-built fixtures need not).
   */
  definitionInvalid?: boolean;
  createdAt: string;
}

/** Metadata projection (no `definition`) for the recent-checkpoints list. */
export type WorkflowCheckpointMetaRecord = Omit<
  WorkflowCheckpointRecord,
  "definition" | "definitionInvalid"
>;

type WorkflowCheckpointsRow = TableRow<"workflow_checkpoints">;

/** The metadata PROJECTION — `META_COLUMNS` deliberately omits `definition`. */
type WorkflowCheckpointsMetaRow = TableColumns<
  "workflow_checkpoints",
  | "id"
  | "workflow_id"
  | "account_id"
  | "created_by_user_id"
  | "source"
  | "name"
  | "prompt"
  | "summary"
  | "created_at"
>;

const META_COLUMNS =
  "id, workflow_id, account_id, created_by_user_id, source, name, prompt, summary, created_at";

function narrowSource(row: { id: string; source: string }): WorkflowCheckpointSource {
  return narrowColumn(
    `workflow_checkpoints.source(${row.id})`,
    WORKFLOW_CHECKPOINT_SOURCES,
    row.source,
  );
}

function rowToRecord(row: WorkflowCheckpointsRow): WorkflowCheckpointRecord {
  // Normalization boundary — NEVER a cast. An invalid snapshot yields the safe
  // empty definition WITH `definitionInvalid: true`, so a caller can tell
  // "this checkpoint captured an empty canvas" from "this checkpoint is
  // corrupt". Restore refuses the second; nothing may silently restore it.
  const parsed = normalizePersistedWorkflowDefinition(row.definition);
  if (parsed.invalid) {
    // Ids and the outcome only — never the persisted graph or any node config.
    console.warn(
      `[workflow_checkpoints] definition for checkpoint ${row.id} (workflow ${row.workflow_id}) failed schema validation — not restorable (definitionInvalid=true).`,
    );
  }
  return {
    id: row.id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    source: narrowSource(row),
    name: row.name,
    prompt: row.prompt,
    summary: row.summary,
    definition: parsed.definition,
    definitionInvalid: parsed.invalid,
    createdAt: row.created_at,
  };
}

function metaRowToRecord(row: WorkflowCheckpointsMetaRow): WorkflowCheckpointMetaRecord {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    accountId: row.account_id,
    createdByUserId: row.created_by_user_id,
    source: narrowSource(row),
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
  const supabase = asTypedDb(await createClient());
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
      definition: toJsonColumn("workflow_checkpoints.definition", input.definition),
    } satisfies TableInsert<"workflow_checkpoints">)
    .select("*")
    .single();
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
  const supabase = asTypedDb(await createClient());
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
  return (data ?? []).map(metaRowToRecord);
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
  const supabase = asTypedDb(await createClient());
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .select("*")
    .eq("id", checkpointId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
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
  const supabase = asTypedDb(await createClient());
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .select("id")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .range(keep, keep + 999);
  if (error) {
    throw new Error(`workflow_checkpoints.pruneToRecent (select) failed: ${error.message}`);
  }
  const stale = (data ?? []).map((r) => r.id);
  if (stale.length === 0) return;
  const { error: delError } = await supabase
    .from("workflow_checkpoints")
    .delete()
    .in("id", stale);
  if (delError) {
    throw new Error(`workflow_checkpoints.pruneToRecent (delete) failed: ${delError.message}`);
  }
}
