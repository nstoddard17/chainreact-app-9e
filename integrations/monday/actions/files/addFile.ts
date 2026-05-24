import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  WORKFLOW_FILES_BUCKET,
  fetchFileBytes,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import { getFileRefSizeGuidance } from "@/core/files/limits";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { addFileToColumn } from "@/integrations/_shared/monday/api/addFileToColumn";
import { AddFileConfigSchema } from "./addFile.schema";

/**
 * Monday `add_file` action handler — Slice 3.MONDAY-4 (FileRef consumer).
 *
 * Fourth+ V2 consumer of the P-S3 FileRef contract (after Slack 2.4,
 * Gmail 2.3, Airtable 2.1). Monday's `add_file_to_column` mutation
 * requires the file BYTES via a multipart upload to `/v2/file` — it does
 * NOT accept a URL (unlike Airtable). So this follows the SLACK
 * upload_file pattern (resolve to bytes via `fetchFileBytes`), not the
 * Airtable signed-URL pattern.
 *
 * FileRef arm handling:
 *   - `v2_storage` — bytes fetched through a Supabase storage adapter
 *     built from the service-role client.
 *   - `signed_url` — bytes fetched through `fetchFileBytes`'s plain
 *     `fetch` path.
 *   - `provider_url` — REJECTED with a structured
 *     `MondayAddFileConfigError` carrying the unblock hint (mirrors
 *     Slack 2.4 `SlackUploadConfigError` + Airtable
 *     `AirtableAddAttachmentConfigError`). Generic cross-provider
 *     bearer-fetch doesn't exist in V2 yet (P-S3 §7).
 *
 * Advisory size check against `getFileRefSizeGuidance("monday")` —
 * warn-only; Monday enforces the hard cap at upload time.
 *
 * Output:
 *   { fileId, fileName, fileUrl, itemId, columnId, sizeBytes, uploadedAt }
 *   - `fileUrl` is Monday's own asset URL. No bytes / base64 in output.
 */

/**
 * Surfaced when the user-supplied FileRef cannot be processed by
 * `add_file`. Mirrors Slack 2.4 / Airtable 2.1 config-error shape.
 */
export class MondayAddFileConfigError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "MondayAddFileConfigError";
    this.code = code;
    this.hint = hint;
  }
}

function buildWorkflowFilesStorageAdapter(
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

export const addFile: ActionHandler = async (input) => {
  const config = AddFileConfigSchema.parse(input.config);

  // provider_url rejection — handler level so the error carries the hint.
  if (config.file.kind === "provider_url") {
    throw new MondayAddFileConfigError(
      "provider_url_unsupported",
      "Monday add_file does not support FileRef(kind=provider_url) yet.",
      "Stage bytes first via a download/staging action (e.g. slack:download_file, gmail:get_attachment, monday:download_file) which yields a FileRef(kind=v2_storage), then pass that ref to add_file.",
    );
  }

  // Narrowed to v2_storage | signed_url — both supported by fetchFileBytes.
  const storage =
    config.file.kind === "v2_storage"
      ? buildWorkflowFilesStorageAdapter(
          `monday:add_file run=${input.runId} node=${input.nodeId}`,
        )
      : undefined;

  const fetched = await fetchFileBytes(config.file, { storage });

  // Advisory size guidance — warn-only.
  const guidance = getFileRefSizeGuidance("monday");
  if (fetched.sizeBytes > guidance) {
    console.warn(
      JSON.stringify({
        event: "monday.add_file.size_exceeds_guidance",
        runId: input.runId,
        nodeId: input.nodeId,
        actualSize: fetched.sizeBytes,
        guidance,
      }),
    );
  }

  const fileName = config.filename ?? fetched.name;

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const asset = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      addFileToColumn({
        accessToken,
        itemId: config.itemId,
        columnId: config.columnId,
        bytes: fetched.bytes,
        fileName,
        mimeType: fetched.mimeType,
      }),
  });

  return {
    output: {
      fileId: asset.id,
      fileName: asset.name ?? fileName,
      fileUrl: asset.url ?? null,
      itemId: config.itemId,
      columnId: config.columnId,
      sizeBytes: fetched.sizeBytes,
      uploadedAt: new Date().toISOString(),
    },
  };
};
