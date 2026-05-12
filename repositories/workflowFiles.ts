import { getServiceRoleClient } from "./supabase/serviceRoleClient";

/**
 * Repository for `workflow_files` — metadata index for files staged in the
 * Supabase `workflow-files` bucket.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §5 / §7:
 *   - This is the *metadata* repository only. Object lifecycle in the
 *     `workflow-files` bucket is owned by the stage/fetch/cleanup
 *     services (P-S3 Commit 4). NOTHING in this file touches
 *     `supabase.storage.*`.
 *   - All access is through the service-role client. Inserts happen
 *     from the engine mid-execution (no user session); reads / deletes
 *     happen from end-of-run cleanup and the nightly reconciler (cron,
 *     also no user session). User-facing read paths will be added in a
 *     follow-up via the SSR client; not required for Commit 3.
 *   - Row shape mirrors the SQL migration. `metadata` is the same
 *     free-form record carried by FileRef (consumers MUST NOT depend on
 *     specific keys).
 */

export interface WorkflowFileRecord {
  id: string;
  userId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  expiresAt: string;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowFilesRow {
  id: string;
  user_id: string;
  workflow_id: string;
  run_id: string;
  node_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  expires_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: WorkflowFilesRow): WorkflowFileRecord {
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    runId: row.run_id,
    nodeId: row.node_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    expiresAt: row.expires_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertWorkflowFileInput {
  userId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  /** Bytes when the provider reports a length; otherwise omit. */
  sizeBytes?: number;
  /**
   * Optional explicit expiry. When omitted, the DB default of
   * `now() + 24h` applies.
   */
  expiresAt?: string;
  /** Free-form provider metadata. Producers MUST NOT include secrets. */
  metadata?: Record<string, unknown>;
}

/**
 * Insert a single metadata row for a newly staged file.
 *
 * Throws on duplicate `storage_path` — the engine constructs
 * deterministic per-run paths, so a collision is an engineering bug
 * (re-running the same node id twice in the same run), NOT a retry
 * surface. Callers that need replay semantics should delete the row
 * first or pick a different path.
 */
export async function insertWorkflowFile(
  input: InsertWorkflowFileInput,
): Promise<WorkflowFileRecord> {
  const supabase = getServiceRoleClient(
    `workflow_files: insert run=${input.runId} node=${input.nodeId}`,
  );
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    workflow_id: input.workflowId,
    run_id: input.runId,
    node_id: input.nodeId,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes ?? null,
    metadata: input.metadata ?? {},
  };
  if (input.expiresAt !== undefined) payload.expires_at = input.expiresAt;

  const { data, error } = await supabase
    .from("workflow_files")
    .insert(payload)
    .select()
    .single<WorkflowFilesRow>();
  if (error || !data) {
    throw new Error(
      `workflow_files.insert failed: ${error?.message ?? "no row returned"}`,
    );
  }
  return rowToRecord(data);
}

export async function getWorkflowFileById(
  id: string,
): Promise<WorkflowFileRecord | null> {
  const supabase = getServiceRoleClient(
    `workflow_files: getById ${id}`,
  );
  const { data, error } = await supabase
    .from("workflow_files")
    .select("*")
    .eq("id", id)
    .maybeSingle<WorkflowFilesRow>();
  if (error) {
    throw new Error(`workflow_files.getById failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

export async function getWorkflowFileByStoragePath(
  storagePath: string,
): Promise<WorkflowFileRecord | null> {
  const supabase = getServiceRoleClient(
    `workflow_files: getByStoragePath ${storagePath}`,
  );
  const { data, error } = await supabase
    .from("workflow_files")
    .select("*")
    .eq("storage_path", storagePath)
    .maybeSingle<WorkflowFilesRow>();
  if (error) {
    throw new Error(
      `workflow_files.getByStoragePath failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * List every file staged during a single run — the dominant cleanup
 * access pattern. Backed by `workflow_files_run_idx`.
 */
export async function listWorkflowFilesForRun(
  runId: string,
): Promise<readonly WorkflowFileRecord[]> {
  const supabase = getServiceRoleClient(
    `workflow_files: listForRun ${runId}`,
  );
  const { data, error } = await supabase
    .from("workflow_files")
    .select("*")
    .eq("run_id", runId);
  if (error) {
    throw new Error(`workflow_files.listForRun failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowFilesRow));
}

export interface ListExpiredOptions {
  /**
   * Maximum number of rows to return in one sweep. Defaults to 500 so a
   * single reconciler tick stays bounded; caller can loop until the
   * result count is < limit. Capped at 5000 to keep the response size
   * predictable.
   */
  limit?: number;
  /**
   * Override "now" for tests / planned cleanups. ISO-8601 string.
   * Defaults to the wall clock at call time.
   */
  now?: string;
}

/**
 * List metadata rows whose `expires_at` has elapsed. Backed by
 * `workflow_files_expires_idx`. Used by the nightly reconciler — the
 * cron deletes the storage objects (via the cleanup service in Commit
 * 4) and then calls `deleteExpiredWorkflowFiles` to clean up the rows.
 */
export async function listExpiredWorkflowFiles(
  opts: ListExpiredOptions = {},
): Promise<readonly WorkflowFileRecord[]> {
  const supabase = getServiceRoleClient(
    "workflow_files: listExpired",
  );
  const limit = Math.min(opts.limit ?? 500, 5000);
  const cutoff = opts.now ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("workflow_files")
    .select("*")
    .lt("expires_at", cutoff)
    .order("expires_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`workflow_files.listExpired failed: ${error.message}`);
  }
  return (data ?? []).map((r) => rowToRecord(r as WorkflowFilesRow));
}

export async function deleteWorkflowFileById(id: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `workflow_files: deleteById ${id}`,
  );
  const { error } = await supabase
    .from("workflow_files")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`workflow_files.deleteById failed: ${error.message}`);
  }
}

/**
 * Bulk-delete every metadata row for a single run. The cleanup service
 * (Commit 4) calls this AFTER it has deleted the storage objects;
 * deleting the metadata first would orphan the bucket. This repository
 * does NOT touch storage by design.
 */
export async function deleteWorkflowFilesByRun(runId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `workflow_files: deleteByRun ${runId}`,
  );
  const { error } = await supabase
    .from("workflow_files")
    .delete()
    .eq("run_id", runId);
  if (error) {
    throw new Error(`workflow_files.deleteByRun failed: ${error.message}`);
  }
}

export interface DeleteExpiredOptions {
  /** Override "now" for tests. ISO-8601 string. */
  now?: string;
}

/**
 * Bulk-delete metadata rows whose `expires_at` has elapsed.
 * Returns the number of rows deleted (best-effort — Supabase returns
 * the rows via `.select("id")` for the count).
 *
 * The nightly reconciler must delete the storage objects FIRST via the
 * cleanup service, then call this. This function does NOT delete
 * objects from the `workflow-files` bucket — that responsibility lives
 * with services/files (Commit 4).
 */
export async function deleteExpiredWorkflowFiles(
  opts: DeleteExpiredOptions = {},
): Promise<number> {
  const supabase = getServiceRoleClient(
    "workflow_files: deleteExpired",
  );
  const cutoff = opts.now ?? new Date().toISOString();
  const { data, error } = await supabase
    .from("workflow_files")
    .delete()
    .lt("expires_at", cutoff)
    .select("id");
  if (error) {
    throw new Error(`workflow_files.deleteExpired failed: ${error.message}`);
  }
  return data?.length ?? 0;
}
