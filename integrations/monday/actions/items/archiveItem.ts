import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { itemsArchive } from "@/integrations/_shared/monday/api/itemsArchive";
import { ArchiveItemConfigSchema } from "./archiveItem.schema";

/**
 * Monday `archive_item` action handler — Slice 3.MONDAY-4.
 *
 * Archives an item via Monday's `archive_item` mutation. Archived items
 * move to the board's archive and are RESTORABLE from Monday's UI
 * (recovery path: board → archive → restore). Less destructive than
 * `delete_item`.
 *
 * Output is STRUCTURAL ONLY (no echoed item name / column values),
 * consistent with the MONDAY-2 delete_item precedent for state-changing
 * lifecycle actions:
 *   { success: true, archivedItemId, archivedAt }
 */
export const archiveItem: ActionHandler = async (input) => {
  const config = ArchiveItemConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "monday"
      ? input.triggerEvent.accountId
      : null;

  const archived = await refreshAndRetry({
    userId: input.userId,
    provider: "monday",
    accountId,
    apiCall: (accessToken) =>
      itemsArchive({ accessToken, itemId: config.itemId }),
  });

  return {
    output: {
      success: true,
      archivedItemId: archived.id,
      archivedAt: new Date().toISOString(),
    },
  };
};
