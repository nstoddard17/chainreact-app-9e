import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import {
  WORKFLOW_FILES_BUCKET,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";

/**
 * Build a `WorkflowFilesStorageAdapter` backed by the service-role
 * Supabase client.
 *
 * Used by action handlers that take `FileRef(kind=v2_storage)` inputs
 * and need to convert them back to bytes via `fetchFileBytes`. The
 * adapter implements the narrow `download(storagePath)` contract — the
 * dispatcher never touches the full storage SDK surface.
 *
 * Per Outlook Mail 2.1 Commit 4 — first cross-provider FileRef-consumer
 * adapter. Slack 2.4's `download_file` is a FileRef *producer* (calls
 * `stageFileToStorage` directly with the service-role client inside the
 * service). This helper is the symmetric *consumer* shape that
 * Outlook's `send_email` attachment expansion + future Outlook
 * `get_attachment` + future Gmail / Drive / OneDrive attachment chains
 * all reuse.
 *
 * Security:
 *   - The adapter MUST NOT include the bucket URL or any signed-URL
 *     fragment in error messages. The Supabase `download()` API throws
 *     errors whose `.message` is sanitized (just `"Object not found"` or
 *     similar). The adapter forwards verbatim — sanitization is
 *     Supabase-SDK-owned, not ours.
 *
 * Service-role: like every consumer of `getServiceRoleClient`, the
 * `reason` parameter is logged for audit. Pass
 * `"<provider>:<action> run=<runId> node=<nodeId>"` shape.
 */
export function createWorkflowFilesStorageAdapter(input: {
  reason: string;
}): WorkflowFilesStorageAdapter {
  const supabase = getServiceRoleClient(input.reason);
  return {
    async download(storagePath: string): Promise<Uint8Array> {
      const { data, error } = await supabase.storage
        .from(WORKFLOW_FILES_BUCKET)
        .download(storagePath);
      if (error || !data) {
        // Generic — never echo the storage path. fetchFileBytes wraps
        // this into FileFetchError(kind=v2_storage, …) with the same
        // message so callers can pattern-match without leaking.
        throw new Error(
          `workflow-files download failed: ${error?.message ?? "no data"}`,
        );
      }
      const buffer = await data.arrayBuffer();
      return new Uint8Array(buffer);
    },
  };
}
