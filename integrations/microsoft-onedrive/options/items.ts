import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { driveItemsList } from "@/integrations/microsoft-onedrive/api/driveItemsList";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import {
  PAGE_SIZE,
  filterByLabel,
  mapOneDriveOptionsError,
  requireOneDriveIntegration,
  requireDep,
} from "./_shared";

/**
 * `microsoft-onedrive:items` options resolver — Slice 4.ONEDRIVE-META-2.
 *
 * Lists the children (files AND folders) of a chosen folder. Backs the
 * `itemId` field on `get_file` / `delete_item` / `move_item` / `copy_item`
 * (item-targeted actions operate on either a file or a folder, so both are
 * included). Single-parent cascade off `parentItemId`.
 *
 * **Dep name `parentItemId` is pinned verbatim** to the UI-scope field
 * added to the item-targeted schemas in ONEDRIVE-META-3; the metadata
 * fields wire `dependsOn: "parentItemId"`. `itemId` also commonly flows
 * from the `file_changed` trigger, so this picker is a convenience.
 *
 * **Auth:** refreshable → `refreshAndRetry`. **Reuses `driveItemsList`**
 * (`GET /me/drive/items/{parentItemId}/children`) — no new read helper.
 *
 * Mapping (DriveItem → OptionItem):
 *   - `value`: item `id` (the DriveItem id handlers consume as itemId).
 *   - `label`: `name` when non-empty, else `id`.
 *   - `description`: `"Folder"` for folders, else the file `mimeType`
 *     (else `"File"`) — a safe type hint that disambiguates a mixed list.
 *     **No download URL / file content is read or surfaced.**
 *
 * Ordering: **preserves Graph order** (one folder's contents; `q` narrows).
 *
 * `hasMore`: `result.nextLink !== null`.
 *
 * Cascade fallback: if `parentItemId` points at a folder deleted / access-
 * lost between picker mounts, `driveItemsList` throws `NotFoundError` →
 * return empty `items` (NOT an error). Re-picking the folder clears
 * `itemId` and refetches.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; other →
 * `PROVIDER_ERROR`. No token / raw Graph body / download-URL / file-content
 * leakage.
 */
export const microsoftOneDriveItemsResolver: OptionsResolver = {
  source: "microsoft-onedrive:items",
  provider: "microsoft-onedrive",
  requiresIntegration: true,
  requiredDeps: ["parentItemId"],
  async resolve(ctx) {
    const integration = requireOneDriveIntegration(ctx);
    const parentItemId = requireDep(ctx, "parentItemId", "folder");

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "microsoft-onedrive",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          driveItemsList({ accessToken, parentItemId, top: PAGE_SIZE }),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { items: [], hasMore: false };
      }
      mapOneDriveOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const item of result.items) {
      if (typeof item.id !== "string" || item.id.length === 0) continue;
      const label =
        typeof item.name === "string" && item.name.length > 0
          ? item.name
          : item.id;
      const description = item.folder
        ? "Folder"
        : item.file?.mimeType && item.file.mimeType.length > 0
          ? item.file.mimeType
          : "File";
      items.push({ value: item.id, label, description });
    }

    return { items: filterByLabel(items, ctx.q), hasMore: result.nextLink !== null };
  },
};
