import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { filesGet } from "../api/filesGet";
import { filesUpdate } from "../api/filesUpdate";
import {
  MoveFileConfigSchema,
  type MoveFileConfig,
} from "./moveFile.schema";

/**
 * Google Drive move action handler.
 *
 * Drive's move semantics require both `addParents` (new parent) and
 * `removeParents` (existing parents). Two principal API calls:
 *   1. `filesGet` to read current parents.
 *   2. `filesUpdate` with addParents + removeParents = current parents CSV.
 *
 * Both are wrapped in `refreshAndRetry` independently. If the file's
 * current parents already include `newParentFolderId`, the `addParents`
 * is a no-op (Drive accepts it idempotently); the move still detaches
 * the file from any OTHER parents, which matches the expected "move"
 * semantic.
 *
 * `NotFoundError` from `filesGet` propagates verbatim — workflow authors
 * see "Google Drive resource 'file <id>' not found" which is clearer than
 * a generic 404.
 */
export const moveFile: ActionHandler = async (input) => {
  const config: MoveFileConfig = MoveFileConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "google-drive"
      ? input.triggerEvent.providerAccountId
      : null;

  // Step 1 — read existing parents so we can detach them on the PATCH.
  const existing = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-drive",
    providerAccountId,
    apiCall: (accessToken) =>
      filesGet({ accessToken, fileId: config.fileId, fields: "id,parents" }),
  });

  const currentParents = existing.parents ?? [];
  const removeParents = currentParents.length
    ? currentParents.join(",")
    : undefined;

  // Step 2 — PATCH addParents + removeParents.
  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "google-drive",
    providerAccountId,
    apiCall: (accessToken) =>
      filesUpdate({
        accessToken,
        fileId: config.fileId,
        body: {},
        addParents: config.newParentFolderId,
        removeParents,
      }),
  });

  return {
    output: {
      fileId: result.id,
      name: result.name ?? null,
      parents: result.parents ?? [],
      previousParents: currentParents,
      modifiedTime: result.modifiedTime ?? null,
    },
  };
};
