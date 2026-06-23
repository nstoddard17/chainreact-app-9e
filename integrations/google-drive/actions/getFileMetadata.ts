import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesGet } from "../api/filesGet";
import {
  GetFileMetadataConfigSchema,
  type GetFileMetadataConfig,
} from "./getFileMetadata.schema";

/**
 * Google Drive `files.get` (metadata-only) action handler
 * (Slice 4.GDRIVE-READ-2).
 *
 * Read-only. Wraps the principal API call in `refreshAndRetry` (Q3); no
 * idempotency concern since this is GET-shaped.
 *
 * Output is BOUNDED and explicitly constructed field-by-field — the raw
 * Drive resource is NEVER spread into the output. Fields are limited to a
 * small, structural metadata set. No file bytes / base64 / content / signed
 * URLs are returned (this endpoint is metadata-only; `webViewLink` is an
 * auth-gated Drive deeplink, not a signed URL — same treatment as
 * list_files / OneDrive `webUrl` / Calendar `htmlLink`).
 */
const FIELDS_MASK =
  "id,name,mimeType,size,createdTime,modifiedTime,webViewLink,trashed,parents";

export const getFileMetadata: ActionHandler = async (input) => {
  const config: GetFileMetadataConfig = GetFileMetadataConfigSchema.parse(
    input.config,
  );

  const providerAccountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-drive",
    providerAccountId,
    apiCall: (accessToken) =>
      filesGet({ accessToken, fileId: config.fileId, fields: FIELDS_MASK }),
  });

  // Drive returns `size` as a string (bytes) for binary files and omits it
  // for native Google types — surface it only when present as a string.
  const size = typeof result.size === "string" ? result.size : null;

  return {
    output: {
      id: result.id,
      name: result.name ?? null,
      mimeType: result.mimeType ?? null,
      size,
      createdTime: result.createdTime ?? null,
      modifiedTime: result.modifiedTime ?? null,
      webViewLink: result.webViewLink ?? null,
      trashed: result.trashed ?? false,
      // Parent folder ids — same non-sensitive class as the file id already
      // returned. Lets downstream workflows branch on location + lets a move be
      // verified by independent read-back. Always an array (empty for root-only).
      parents: result.parents ?? [],
    },
  };
};
