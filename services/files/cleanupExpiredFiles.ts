/**
 * Bulk cleanup of expired workflow_files.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §5:
 *   - Two cleanup paths exist: (a) end-of-run inline, called from the
 *     engine when a run finishes (not implemented in P-S3 Commit 4 —
 *     that's a Phase 2 follow-up wired into the engine finalization
 *     layer); (b) nightly reconciler, called from the cron route in
 *     this commit. Both paths use this service.
 *   - Storage object delete happens FIRST (per row), then the metadata
 *     row delete. Deleting the metadata first would orphan the object
 *     in the bucket (the nightly reconciler couldn't find it again).
 *   - One row's failure does NOT abort the batch — increment `failed`
 *     and continue. Reasons:
 *       1. Per-object errors are common (Supabase transient 5xx,
 *          permission edge cases) and would otherwise block every
 *          remaining row from being cleaned for the rest of the tick.
 *       2. The next tick reads the same expired rows from the
 *          repository and tries again — failures are self-healing on
 *          the next cron tick.
 *   - "Object already gone" is NOT a failure. Supabase's `remove([path])`
 *     succeeds with `data: []` when the object isn't there; we count
 *     that as a successful storage delete so the metadata row is
 *     reclaimed regardless.
 *
 * Service-role: cron runs with no user session.
 */

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import {
  deleteWorkflowFileById,
  listExpiredWorkflowFiles,
  type WorkflowFileRecord,
} from "@/repositories/workflowFiles";
import { WORKFLOW_FILES_BUCKET } from "@/core/files/fetchFileBytes";

export interface CleanupResult {
  /** Rows the reconciler examined in this tick. */
  scanned: number;
  /** Storage objects successfully removed (incl. already-gone). */
  storageDeleted: number;
  /** Metadata rows successfully deleted. */
  metadataDeleted: number;
  /** Rows that failed at storage delete OR metadata delete. */
  failed: number;
  /** ISO timestamp at start. */
  startedAt: string;
}

export interface CleanupOptions {
  /** Override "now" for tests / scheduled cleanups. */
  now?: string;
  /**
   * Maximum rows per tick. Defaults to the repository's default (500);
   * capped at 5000 by the repository, so passing a larger value here
   * does not bypass that cap.
   */
  limit?: number;
}

export async function cleanupExpiredFiles(
  opts: CleanupOptions = {},
): Promise<CleanupResult> {
  const startedAt = new Date().toISOString();
  const expired = await listExpiredWorkflowFiles({
    ...(opts.now !== undefined && { now: opts.now }),
    ...(opts.limit !== undefined && { limit: opts.limit }),
  });

  const result: CleanupResult = {
    scanned: expired.length,
    storageDeleted: 0,
    metadataDeleted: 0,
    failed: 0,
    startedAt,
  };

  if (expired.length === 0) return result;

  const supabase = getServiceRoleClient("files: nightly reconciler cleanup");

  for (const row of expired) {
    const ok = await cleanupOne(supabase, row, result);
    if (!ok) result.failed += 1;
  }

  return result;
}

/**
 * Returns true when both storage + metadata deletes succeeded (or the
 * object was already gone). Bumps the per-step counters on success.
 * The caller increments `failed` when this returns false.
 */
async function cleanupOne(
  supabase: ReturnType<typeof getServiceRoleClient>,
  row: WorkflowFileRecord,
  result: CleanupResult,
): Promise<boolean> {
  // Storage delete first. Supabase treats missing objects as a no-op
  // success (returns `{ data: [], error: null }`), so we don't need to
  // sniff for "not found" — we just count any non-error response as
  // success.
  const { error: storageError } = await supabase.storage
    .from(WORKFLOW_FILES_BUCKET)
    .remove([row.storagePath]);
  if (storageError) {
    console.warn(
      JSON.stringify({
        event: "files.cleanup.storage_remove_failed",
        rowId: row.id,
        message: storageError.message,
      }),
    );
    return false;
  }
  result.storageDeleted += 1;

  // Metadata delete after storage delete. If this fails the object is
  // gone but the row remains expired; the next tick reads the row,
  // tries to delete an already-gone object (success), then retries
  // the metadata delete.
  try {
    await deleteWorkflowFileById(row.id);
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "files.cleanup.metadata_delete_failed",
        rowId: row.id,
        message: (err as Error).message,
      }),
    );
    return false;
  }
  result.metadataDeleted += 1;
  return true;
}
