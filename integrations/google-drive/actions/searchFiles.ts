import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesList } from "../api/filesList";
import {
  SearchFilesConfigSchema,
  type SearchFilesConfig,
} from "./searchFiles.schema";

/**
 * Google Drive `files.list` (name search) action handler
 * (Slice 4.GDRIVE-READ-2).
 *
 * Read-only. Reuses the shared `filesList` wrapper with `nameContains` so
 * Drive does the title match server-side. Wrapped in `refreshAndRetry`
 * (Q3); GET-shaped so no idempotency concern.
 *
 * One page only (no auto-pagination). Each result is explicitly projected
 * to a small, bounded metadata shape — the raw Drive resource is NEVER
 * spread into the output, and only a metadata-scoped `fields` mask is
 * requested (no owners/permissions, no file content). `webViewLink` is an
 * auth-gated deeplink, not a signed URL (file-output-contract compliant).
 */
const FIELDS_MASK =
  "nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,size,webViewLink)";

export const searchFiles: ActionHandler = async (input) => {
  const config: SearchFilesConfig = SearchFilesConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-drive",
    providerAccountId,
    apiCall: (accessToken) =>
      filesList({
        accessToken,
        nameContains: config.query,
        folderId: config.folderId,
        pageSize: config.pageSize,
        pageToken: config.pageToken,
        fields: FIELDS_MASK,
        // Search excludes trashed files — a "find my file" lookup should
        // not surface items the user already threw away.
        includeTrashed: false,
      }),
  });

  const files = (result.files ?? []).map((f) => ({
    id: f.id,
    name: f.name ?? null,
    mimeType: f.mimeType ?? null,
    modifiedTime: f.modifiedTime ?? null,
    size: typeof f.size === "string" ? f.size : null,
    webViewLink: f.webViewLink ?? null,
  }));

  return {
    output: {
      files,
      count: files.length,
      nextPageToken: result.nextPageToken ?? null,
      incompleteSearch: result.incompleteSearch ?? false,
    },
  };
};
