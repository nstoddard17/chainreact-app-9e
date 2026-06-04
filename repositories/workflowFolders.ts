import { createClient } from "@/utils/supabase/server";

/**
 * Repository for `public.workflow_folders` (Slice 4.WORKFLOW-FOLDERS-3 / WF-2).
 *
 * Server-side, session-client only — every read/write is RLS-scoped to account
 * members (workflow_folders_*_account_member from the WF-1 migration). Hierarchy
 * rules (depth / cycle / duplicate-name / tier limits) live in
 * services/workflowFolders/*; this layer only persists what the service decides.
 * The DB same-account trigger + the partial UNIQUE sibling-name index are the
 * backstops the service maps back to typed errors.
 *
 * This slice persists CRUD + move + reorder only. The trash columns
 * (deleted_at / purge_after / delete_operation_id / deleted_from_parent_folder_id)
 * stay inert here — soft-delete / restore / purge land in WF-3 / WF-4. Reads
 * exclude soft-deleted rows by default (`deleted_at IS NULL`).
 */

export interface WorkflowFolderRecord {
  id: string;
  accountId: string;
  parentFolderId: string | null;
  name: string;
  position: number;
  /** Provenance only — NOT authorization (any account member may manage folders). */
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  /** null = live. Reads default to live-only. */
  deletedAt: string | null;
  // Trash columns (WF-3) — populated only while soft-deleted.
  deletedByUserId: string | null;
  purgeAfter: string | null;
  deletedFromParentFolderId: string | null;
  deleteOperationId: string | null;
}

interface WorkflowFoldersRow {
  id: string;
  account_id: string;
  parent_folder_id: string | null;
  name: string;
  position: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
  purge_after: string | null;
  deleted_from_parent_folder_id: string | null;
  delete_operation_id: string | null;
}

function rowToRecord(row: WorkflowFoldersRow): WorkflowFolderRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    parentFolderId: row.parent_folder_id,
    name: row.name,
    position: row.position,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedByUserId: row.deleted_by_user_id,
    purgeAfter: row.purge_after,
    deletedFromParentFolderId: row.deleted_from_parent_folder_id,
    deleteOperationId: row.delete_operation_id,
  };
}

const SELECT_COLS =
  "id, account_id, parent_folder_id, name, position, created_by_user_id, created_at, updated_at, deleted_at, deleted_by_user_id, purge_after, deleted_from_parent_folder_id, delete_operation_id";

/**
 * List an account's folders. Excludes soft-deleted rows by default (the live
 * tree). Ordered by (parent_folder_id, position) so the caller can build the
 * in-memory hierarchy + sibling order in one pass.
 */
export async function listByAccount(
  accountId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<readonly WorkflowFolderRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("workflow_folders")
    .select(SELECT_COLS)
    .eq("account_id", accountId);
  if (!opts.includeDeleted) {
    query = query.is("deleted_at", null);
  }
  const { data, error } = await query
    .order("parent_folder_id", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true });
  if (error) throw new Error(`workflow_folders.listByAccount failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowFoldersRow));
}

export async function getById(
  folderId: string,
): Promise<WorkflowFolderRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .select(SELECT_COLS)
    .eq("id", folderId)
    .maybeSingle<WorkflowFoldersRow>();
  if (error) throw new Error(`workflow_folders.getById failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

export interface CreateFolderInput {
  accountId: string;
  createdByUserId: string;
  name: string;
  parentFolderId: string | null;
  position: number;
}

export async function create(
  input: CreateFolderInput,
): Promise<WorkflowFolderRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .insert({
      account_id: input.accountId,
      created_by_user_id: input.createdByUserId,
      name: input.name,
      parent_folder_id: input.parentFolderId,
      position: input.position,
    })
    .select(SELECT_COLS)
    .single<WorkflowFoldersRow>();
  if (error || !data) {
    throw new Error(`workflow_folders.create failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

export async function updateName(
  folderId: string,
  name: string,
): Promise<WorkflowFolderRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .update({ name })
    .eq("id", folderId)
    .select(SELECT_COLS)
    .single<WorkflowFoldersRow>();
  if (error || !data) {
    throw new Error(`workflow_folders.updateName failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

export async function updateParentAndPosition(
  folderId: string,
  parentFolderId: string | null,
  position: number,
): Promise<WorkflowFolderRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .update({ parent_folder_id: parentFolderId, position })
    .eq("id", folderId)
    .select(SELECT_COLS)
    .single<WorkflowFoldersRow>();
  if (error || !data) {
    throw new Error(`workflow_folders.updateParentAndPosition failed: ${error?.message ?? "no row returned"}`);
  }
  return rowToRecord(data);
}

/**
 * Reorder siblings — last-write-wins (locked decision). Writes each
 * (id → position) in turn; RLS scopes every write to the caller's account, so
 * an id outside the account simply matches zero rows. The caller validates the
 * id set belongs to the same parent first.
 */
export async function updatePositions(
  updates: ReadonlyArray<{ id: string; position: number }>,
): Promise<void> {
  if (updates.length === 0) return;
  const supabase = await createClient();
  for (const u of updates) {
    const { error } = await supabase
      .from("workflow_folders")
      .update({ position: u.position })
      .eq("id", u.id);
    if (error) {
      throw new Error(`workflow_folders.updatePositions failed: ${error.message}`);
    }
  }
}

// ── WF-3 trash ────────────────────────────────────────────────────────────────

export interface SoftDeleteFolderInput {
  folderId: string;
  deletedAt: string;
  deletedByUserId: string;
  purgeAfter: string;
  /** Snapshot of parent_folder_id at delete time (for restore). */
  deletedFromParentFolderId: string | null;
  deleteOperationId: string;
}

/**
 * Soft-delete a single folder (stamp the trash columns). Idempotent-safe: only
 * matches a currently-live row (`deleted_at IS NULL`). Returns the row, or null
 * if it was already trashed / not visible.
 */
export async function softDelete(
  input: SoftDeleteFolderInput,
): Promise<WorkflowFolderRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .update({
      deleted_at: input.deletedAt,
      deleted_by_user_id: input.deletedByUserId,
      purge_after: input.purgeAfter,
      deleted_from_parent_folder_id: input.deletedFromParentFolderId,
      delete_operation_id: input.deleteOperationId,
    })
    .eq("id", input.folderId)
    .is("deleted_at", null)
    .select(SELECT_COLS)
    .maybeSingle<WorkflowFoldersRow>();
  if (error) throw new Error(`workflow_folders.softDelete failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/**
 * Restore a trashed folder: clear the trash columns and set its parent to
 * `parentFolderId` (the resolved restore target — original parent if live, else
 * null/root). Only matches a currently-trashed row. Returns the row or null.
 */
export async function restore(
  folderId: string,
  parentFolderId: string | null,
): Promise<WorkflowFolderRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .update({
      deleted_at: null,
      deleted_by_user_id: null,
      purge_after: null,
      deleted_from_parent_folder_id: null,
      delete_operation_id: null,
      parent_folder_id: parentFolderId,
    })
    .eq("id", folderId)
    .not("deleted_at", "is", null)
    .select(SELECT_COLS)
    .maybeSingle<WorkflowFoldersRow>();
  if (error) throw new Error(`workflow_folders.restore failed: ${error.message}`);
  return data ? rowToRecord(data) : null;
}

/** All folders stamped with a trash batch id (for batch restore). */
export async function listByDeleteOperation(
  deleteOperationId: string,
): Promise<readonly WorkflowFolderRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .select(SELECT_COLS)
    .eq("delete_operation_id", deleteOperationId);
  if (error) throw new Error(`workflow_folders.listByDeleteOperation failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowFoldersRow));
}

/** Trashed folders still within the restore window for an account (the Trash listing). */
export async function listTrashedByAccount(
  accountId: string,
): Promise<readonly WorkflowFolderRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_folders")
    .select(SELECT_COLS)
    .eq("account_id", accountId)
    .not("deleted_at", "is", null)
    .gt("purge_after", new Date().toISOString())
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(`workflow_folders.listTrashedByAccount failed: ${error.message}`);
  return (data ?? []).map((r) => rowToRecord(r as WorkflowFoldersRow));
}
