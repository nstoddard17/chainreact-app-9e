import {
  WORKFLOW_FILES_BUCKET,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

/**
 * Build a `WorkflowFilesStorageAdapter` for `fetchFileBytes` when a
 * Facebook media handler consumes a `FileRef(kind=v2_storage)` — Slice
 * 3.FACEBOOK-2. Mirrors `dropbox:upload_file`'s inline adapter; extracted
 * here so `upload_photo` + `upload_video` share one implementation. Never
 * includes a signed URL / token in a thrown error (the adapter contract).
 */
export function buildWorkflowFilesStorageAdapter(
  reason: string,
): WorkflowFilesStorageAdapter {
  return {
    async download(storagePath: string): Promise<Uint8Array> {
      const supabase = getServiceRoleClient(reason);
      const { data, error } = await supabase.storage
        .from(WORKFLOW_FILES_BUCKET)
        .download(storagePath);
      if (error || !data) {
        throw new Error(
          `workflow-files download failed: ${error?.message ?? "no data"}`,
        );
      }
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}
