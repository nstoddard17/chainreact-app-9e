import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "../api/errors";
import { filesDelete } from "../api/filesDelete";
import { filesUpdate } from "../api/filesUpdate";
import {
  DeleteFileConfigSchema,
  type DeleteFileConfig,
} from "./deleteFile.schema";

/**
 * Google Drive delete action handler.
 *
 * Two modes per Q11 explicit choice:
 *   - `permanent: true`  → DELETE; file gone.
 *   - `permanent: false` → PATCH `{ trashed: true }`; file recoverable
 *     from Drive's trash UI.
 *
 * NotFoundError on either mode is translated to `{ alreadyDeleted: true }`
 * so retry-after-success is idempotent: a second run for the same fileId
 * succeeds with no API call rather than failing the workflow. Mirrors
 * Calendar's delete_event idempotency behavior.
 */
export const deleteFile: ActionHandler = async (input) => {
  const config: DeleteFileConfig = DeleteFileConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.accountId
      : null;

  if (config.permanent) {
    try {
      await refreshAndRetry({
        userId: input.userId,
        provider: "google-drive",
        accountId,
        apiCall: (accessToken) =>
          filesDelete({ accessToken, fileId: config.fileId }),
      });
      return {
        output: {
          fileId: config.fileId,
          mode: "permanent" as const,
          alreadyDeleted: false,
        },
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return {
          output: {
            fileId: config.fileId,
            mode: "permanent" as const,
            alreadyDeleted: true,
          },
        };
      }
      throw err;
    }
  }

  // Trash mode — PATCH trashed=true.
  try {
    const result = await refreshAndRetry({
      userId: input.userId,
      provider: "google-drive",
      accountId,
      apiCall: (accessToken) =>
        filesUpdate({
          accessToken,
          fileId: config.fileId,
          body: { trashed: true },
          fields: "id,trashed",
        }),
    });
    return {
      output: {
        fileId: result.id,
        mode: "trash" as const,
        trashed: result.trashed ?? true,
        alreadyDeleted: false,
      },
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return {
        output: {
          fileId: config.fileId,
          mode: "trash" as const,
          trashed: true,
          alreadyDeleted: true,
        },
      };
    }
    throw err;
  }
};
