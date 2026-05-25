import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesList } from "../api/filesList";
import {
  ListFilesConfigSchema,
  type ListFilesConfig,
} from "./listFiles.schema";

/**
 * Google Drive `files.list` action handler.
 *
 * Read-only. Wraps `filesList` in `refreshAndRetry` (Q3); no idempotency
 * concern since this is GET-shaped.
 *
 * Output preserves the array shape so downstream nodes can iterate. When
 * the response includes a `nextPageToken`, it's surfaced as a top-level
 * output so workflows can cascade pagination via a follow-up node.
 */
export const listFiles: ActionHandler = async (input) => {
  const config: ListFilesConfig = ListFilesConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "google-drive",
    accountId,
    apiCall: (accessToken) =>
      filesList({
        accessToken,
        folderId: config.folderId,
        pageSize: config.pageSize,
        pageToken: config.pageToken,
        includeTrashed: config.includeTrashed,
      }),
  });

  return {
    output: {
      files: result.files ?? [],
      nextPageToken: result.nextPageToken ?? null,
      incompleteSearch: result.incompleteSearch ?? false,
    },
  };
};
