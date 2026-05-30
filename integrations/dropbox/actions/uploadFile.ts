import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  WORKFLOW_FILES_BUCKET,
  fetchFileBytes,
  type WorkflowFilesStorageAdapter,
} from "@/core/files/fetchFileBytes";
import { getFileRefSizeGuidance } from "@/core/files/limits";
import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";
import { filesUpload } from "@/integrations/_shared/dropbox/api/filesUpload";
import { normalizeDropboxEntry } from "@/integrations/_shared/dropbox/api/_types";
import { UploadFileConfigSchema } from "./uploadFile.schema";

/**
 * Dropbox `upload_file` — Slice 3.DROPBOX-2 (FileRef consumer).
 *
 * Resolves a FileRef to bytes via `fetchFileBytes`, then uploads to
 * Dropbox's content host (`/2/files/upload`). Same consumer pattern as
 * `slack:upload_file` / `monday:add_file`:
 *   - `v2_storage` — bytes via the Supabase storage adapter.
 *   - `signed_url` — bytes via `fetchFileBytes`'s plain fetch.
 *   - `provider_url` — REJECTED with a structured `DropboxUploadConfigError`
 *     (V2 has no cross-provider bearer fetch — P-S3 §7).
 *
 * Destination path = `joinDropboxPath(config.path, filename)` where
 * `filename` defaults to the FileRef name. `mode` defaults to `"add"`
 * (never silently overwrites). Single-shot ≤150 MB (resumable deferred);
 * advisory size warning past `getFileRefSizeGuidance("dropbox")`.
 *
 * Output: structural metadata only — never bytes.
 */

export class DropboxUploadConfigError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(code: string, message: string, hint: string) {
    super(message);
    this.name = "DropboxUploadConfigError";
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

/** Join a Dropbox folder path + filename into an absolute file path. */
function joinDropboxPath(folder: string, filename: string): string {
  const trimmedFolder = folder.replace(/\/+$/, "");
  const full = `${trimmedFolder}/${filename}`;
  return full.startsWith("/") ? full : `/${full}`;
}

export const uploadFile: ActionHandler = async (input) => {
  const config = UploadFileConfigSchema.parse(input.config);

  if (config.file.kind === "provider_url") {
    throw new DropboxUploadConfigError(
      "provider_url_unsupported",
      "Dropbox upload_file does not support FileRef(kind=provider_url) yet.",
      "Stage bytes first via a download/staging action (e.g. dropbox:download_file, slack:download_file, gmail:get_attachment) which yields a FileRef(kind=v2_storage), then pass that ref to upload_file.",
    );
  }

  const storage =
    config.file.kind === "v2_storage"
      ? buildWorkflowFilesStorageAdapter(
          `dropbox:upload_file run=${input.runId} node=${input.nodeId}`,
        )
      : undefined;

  const fetched = await fetchFileBytes(config.file, { storage });

  const guidance = getFileRefSizeGuidance("dropbox");
  if (fetched.sizeBytes > guidance) {
    console.warn(
      JSON.stringify({
        event: "dropbox.upload_file.size_exceeds_guidance",
        runId: input.runId,
        nodeId: input.nodeId,
        actualSize: fetched.sizeBytes,
        guidance,
      }),
    );
  }

  const filename = config.filename ?? fetched.name;
  const destPath = joinDropboxPath(config.path, filename);

  const providerAccountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.providerAccountId
      : null;

  const entry = await refreshAndRetry({
    accountId: input.accountId,
    provider: "dropbox",
    providerAccountId,
    apiCall: (accessToken) =>
      filesUpload({
        accessToken,
        path: destPath,
        bytes: fetched.bytes,
        mode: config.mode,
        autorename: config.autorename,
      }),
  });

  const n = normalizeDropboxEntry(entry);
  return {
    output: {
      id: n.id,
      name: n.name,
      path: n.path,
      sizeBytes: n.sizeBytes ?? fetched.sizeBytes,
      rev: n.rev,
      clientModified: n.clientModified,
      serverModified: n.serverModified,
    },
  };
};
