import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesDelete } from "@/integrations/_shared/dropbox/api/filesDelete";
import { DeleteFileConfigSchema } from "./deleteFile.schema";

/**
 * Dropbox `delete_file` — Slice 3.DROPBOX-2. High-risk / destructive
 * (Dropbox moves to trash; recoverable ~30d). Output is STRUCTURAL ONLY —
 * the deleted entry's name / content are never echoed (parity with
 * `monday:delete_item`).
 *
 * Output: `{ success, path, deletedAt }`.
 */
export const deleteFile: ActionHandler = async (input) => {
  const config = DeleteFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "dropbox"
      ? input.triggerEvent.accountId
      : null;

  await refreshAndRetry({
    userId: input.userId,
    provider: "dropbox",
    accountId,
    apiCall: (accessToken) => filesDelete({ accessToken, path: config.path }),
  });

  return {
    output: {
      success: true,
      path: config.path,
      deletedAt: new Date().toISOString(),
    },
  };
};
