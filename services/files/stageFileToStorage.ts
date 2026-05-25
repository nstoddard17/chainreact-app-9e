/**
 * Stage downloaded provider bytes into Supabase storage + record the
 * metadata row.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §5:
 *   - Download-style action handlers (Slack `download_file`, future
 *     Gmail `download_attachment`, etc.) call this service to convert
 *     bytes-in-memory into a `FileRef(kind=v2_storage)`. The returned
 *     ref is what the handler emits in its action output — bytes never
 *     touch `workflow_runs.steps`.
 *   - The canonical storage path is
 *     `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` (built via
 *     `buildStoragePath`). Filename is sanitized through
 *     `sanitizeFilename` before path construction.
 *
 * Partial-failure policy:
 *   - Upload succeeds, metadata insert fails: best-effort
 *     `storage.remove([path])` (the object is orphaned otherwise),
 *     then re-throw the metadata error. The metadata index is the
 *     source of truth for "did we stage this"; an unindexed object
 *     would also be invisible to the nightly reconciler.
 *   - Metadata insert succeeds, returning the FileRef fails (e.g. a
 *     synchronous bug in the caller): nothing to clean up — the
 *     metadata row + storage object are both committed; the next
 *     end-of-run cleanup or nightly reconciler picks them up at
 *     `expires_at`.
 *
 * Size guidance:
 *   - The producer's API enforces the hard cap (Slack 25 MB, OneDrive
 *     4 MB, …). This service WARNs via `console.warn` when the size
 *     exceeds the published guidance, but does NOT reject — that would
 *     diverge from the P-S3 §4 "guidance not enforcement" decision and
 *     would block legitimate users on providers we haven't audited.
 *     Hard quotas land in Phase 7.
 *
 * Service-role: every Supabase call runs with no user session.
 */

import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import {
  insertWorkflowFile,
  type WorkflowFileRecord,
} from "@/repositories/workflowFiles";
import { fileRefFromStoragePath } from "@/core/files/createFileRef";
import { sanitizeFilename } from "@/core/files/sanitizeFilename";
import {
  WORKFLOW_FILES_BUCKET,
  buildStoragePath,
} from "@/core/files/fetchFileBytes";
import {
  FILE_REF_SIZE_GUIDANCE,
  getFileRefSizeGuidance,
} from "@/core/files/limits";
import type { V2StorageFileRef } from "@/contracts/file";

export interface StageFileInput {
  userId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  /** Untrusted filename — sanitized inside this service. */
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /**
   * Provider-reported size when available. Stored on the metadata row.
   * Independent from `bytes.byteLength`, which is always the actual
   * uploaded size and is what we report on the returned FileRef.
   */
  sizeBytes?: number;
  /** Optional explicit expiry; falls through to the DB's 24h default. */
  expiresAt?: string;
  /**
   * Optional diagnostic provider id (e.g. `"slack"` for files staged
   * out of `slack:download_file`). Recorded on the returned FileRef.
   */
  provider?: string;
  /** Free-form metadata. Producers MUST NOT include tokens or secrets. */
  metadata?: Record<string, unknown>;
}

export interface StageFileResult {
  ref: V2StorageFileRef;
  record: WorkflowFileRecord;
}

export async function stageFileToStorage(
  input: StageFileInput,
): Promise<StageFileResult> {
  const fileName = sanitizeFilename(input.fileName);
  const storagePath = buildStoragePath({
    userId: input.userId,
    workflowId: input.workflowId,
    runId: input.runId,
    nodeId: input.nodeId,
    fileName,
  });

  // Soft guidance check — log only, never reject. Producers enforce
  // hard caps; Phase 7 introduces quotas.
  const actualSize = input.bytes.byteLength;
  const guidance = input.provider
    ? getFileRefSizeGuidance(input.provider)
    : FILE_REF_SIZE_GUIDANCE.default;
  if (actualSize > guidance) {
    console.warn(
      JSON.stringify({
        event: "files.stage.size_exceeds_guidance",
        provider: input.provider ?? "(unspecified)",
        nodeId: input.nodeId,
        runId: input.runId,
        actualSize,
        guidance,
      }),
    );
  }

  const supabase = getServiceRoleClient(
    `files: stage run=${input.runId} node=${input.nodeId}`,
  );

  // 1) Upload to the workflow-files bucket. `upsert: true` is
  //    intentional — the deterministic path scheme means a duplicate
  //    upload is a re-stage of the same logical content; either the
  //    repository insert below will collide (engineering bug) or this
  //    is a deliberate retry of a partial failure. The metadata row's
  //    UNIQUE(storage_path) is the real source of truth.
  const uploadResult = await supabase.storage
    .from(WORKFLOW_FILES_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: input.mimeType,
      upsert: true,
    });
  if (uploadResult.error) {
    throw new Error(
      `files.stage upload failed: ${uploadResult.error.message}`,
    );
  }

  // 2) Insert metadata row. Failure here orphans the object — clean it
  //    up best-effort, then re-throw so the caller surfaces the
  //    metadata error (the actual failure mode).
  let record: WorkflowFileRecord;
  try {
    record = await insertWorkflowFile({
      userId: input.userId,
      workflowId: input.workflowId,
      runId: input.runId,
      nodeId: input.nodeId,
      storagePath,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? actualSize,
      ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
      metadata: input.metadata,
    });
  } catch (err) {
    // Best-effort orphan cleanup. We swallow the remove error because
    // the original metadata error is the one the caller needs to see.
    try {
      await supabase.storage
        .from(WORKFLOW_FILES_BUCKET)
        .remove([storagePath]);
    } catch (cleanupErr) {
      console.warn(
        JSON.stringify({
          event: "files.stage.orphan_cleanup_failed",
          storagePath,
          message: (cleanupErr as Error).message,
        }),
      );
    }
    throw err;
  }

  const ref = fileRefFromStoragePath({
    name: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes ?? actualSize,
    storagePath: record.storagePath,
    ...(input.provider !== undefined && { provider: input.provider }),
    expiresAt: record.expiresAt,
    metadata: record.metadata as Record<string, unknown>,
  });

  return { ref, record };
}
