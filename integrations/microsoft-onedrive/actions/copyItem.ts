import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { driveItemsCopy } from "../api/driveItemsCopy";
import { CopyItemConfigSchema } from "./copyItem.schema";

/**
 * OneDrive `copy_item` action handler.
 *
 * Returns `{ status: "pending", monitorUrl, sourceItemId,
 * targetParentItemId, newName }` synchronously. Slice 8 deliberately
 * does NOT poll the monitor URL — V1's long-running wait is the V1
 * rot we explicitly fix (exceeds serverless timeout for big copies).
 *
 * Workflow authors who need to wait for completion can chain a
 * follow-up node that polls the monitor URL (out of Slice 8 scope —
 * the monitor URL is surfaced for forward-compat).
 *
 * Output shape (downstream variable refs):
 *   { status: "pending", monitorUrl, sourceItemId, targetParentItemId,
 *     newName: string | null }
 */
export const copyItem: ActionHandler = async (input) => {
  const config = CopyItemConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "microsoft-onedrive"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "microsoft-onedrive",
    providerAccountId,
    apiCall: (accessToken) =>
      driveItemsCopy({
        accessToken,
        itemId: config.itemId,
        targetParentItemId: config.targetParentItemId,
        newName: config.newName,
      }),
  });

  return {
    output: {
      status: result.status,
      monitorUrl: result.monitorUrl,
      sourceItemId: config.itemId,
      targetParentItemId: config.targetParentItemId,
      newName: config.newName ?? null,
    },
  };
};
