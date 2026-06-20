import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { listMailFolders } from "../api/listMailFolders";
import { ListFoldersConfigSchema } from "./listFolders.schema";

/**
 * Microsoft Outlook `list_folders` action handler (Slice 4.OUTLOOK-READ-1).
 *
 * Read-only. Reuses the shared `listMailFolders` wrapper (also backs the
 * `microsoft-outlook:folders` options resolver) behind `refreshAndRetry`
 * (Q3); GET-shaped so no idempotency concern.
 *
 * Output is bounded and explicitly projected to `{ id, displayName }` per
 * folder — the raw Graph envelope is never spread, and the wrapper's
 * `$select=id,displayName` means no message content / counts are read.
 * `count` mirrors `folders.length` for branch-on-empty workflows.
 */
export const listFolders: ActionHandler = async (input) => {
  ListFoldersConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-outlook"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-outlook",
    providerAccountId,
    apiCall: (accessToken) => listMailFolders({ accessToken }),
  });

  const folders = result.value.map((f) => ({
    id: f.id,
    displayName: f.displayName ?? null,
  }));

  return {
    output: {
      folders,
      count: folders.length,
    },
  };
};
