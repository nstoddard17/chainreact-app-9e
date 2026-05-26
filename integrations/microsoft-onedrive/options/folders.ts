import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import { driveItemsList } from "@/integrations/microsoft-onedrive/api/driveItemsList";
import {
  PAGE_SIZE,
  filterByLabel,
  formatModified,
  mapOneDriveOptionsError,
  requireOneDriveIntegration,
} from "./_shared";

/**
 * `microsoft-onedrive:folders` options resolver — Slice 4.ONEDRIVE-META-2.
 *
 * Account-scoped folder picker (no deps). Backs the destination-folder
 * fields — the real `parentItemId` on `upload_file` / `create_folder` /
 * `list_items` and the real `targetParentItemId` on `move_item` /
 * `copy_item` (TRELLO-style; wired in ONEDRIVE-META-3).
 *
 * **Why a resolver is required:** a OneDrive `parentItemId` is an opaque
 * Graph DriveItem id, not a human-typeable value (same rationale as
 * Excel's `workbookId`).
 *
 * **First-pass scope: ROOT folders only.** Graph lists children one level
 * at a time (no cheap all-folders query like Google Drive's `files.list`),
 * so this picker reuses `driveItemsList` against `/me/drive/root/children`
 * and client-filters to folders. Deeper destination folders are typeable;
 * a recursive folder cascade is a deferred enhancement (ONEDRIVE-META-1
 * §3 — "don't overbuild").
 *
 * **Auth:** refreshable → `refreshAndRetry({provider:"microsoft-onedrive",
 * accountId})`. **Reuses the existing `driveItemsList` helper** — no new
 * read helper (`api/` already has a list helper, unlike Trello/Airtable).
 *
 * Mapping (DriveItem → OptionItem):
 *   - `value`: item `id` (the DriveItem id handlers consume as parentItemId).
 *   - `label`: `name` when non-empty, else `id`.
 *   - `description`: `Modified YYYY-MM-DD` when available — safe, non-secret
 *     metadata that disambiguates similarly-named folders. Folder NAMES are
 *     titles in the user's own drive, not secrets; no download URL / file
 *     content is read here.
 *
 * Ordering: **sorted by label (alphabetical)** — drive-root order has no
 * strong meaning for a flat folder picker; alpha sort aids findability
 * (matches the `airtable:bases` / `trello:boards` root-picker precedent).
 *
 * `hasMore`: `result.nextLink !== null` (Graph's pagination signal). Note
 * the page is filtered to folders client-side, so `hasMore` advertises
 * that more drive-root ITEMS exist beyond this page (a folder may be among
 * them) — the v1 renderer surfaces a "refine search" hint.
 *
 * Error sanitization: auth → `INTEGRATION_DISCONNECTED`; anything else →
 * `PROVIDER_ERROR`. Token / raw Graph body / download URLs never reach the
 * browser.
 */
export const microsoftOneDriveFoldersResolver: OptionsResolver = {
  source: "microsoft-onedrive:folders",
  provider: "microsoft-onedrive",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireOneDriveIntegration(ctx);

    let result;
    try {
      result = await refreshAndRetry({
        userId: ctx.userId,
        provider: "microsoft-onedrive",
        accountId: integration.providerAccountId,
        apiCall: (accessToken) => driveItemsList({ accessToken, top: PAGE_SIZE }),
      });
    } catch (err) {
      mapOneDriveOptionsError(err);
    }

    const items: OptionItem[] = [];
    for (const item of result.items) {
      // Folders only — `folder` facet present, `file` facet absent.
      if (!item.folder) continue;
      if (typeof item.id !== "string" || item.id.length === 0) continue;
      const label =
        typeof item.name === "string" && item.name.length > 0
          ? item.name
          : item.id;
      const description = formatModified(item.lastModifiedDateTime);
      items.push(
        description !== undefined
          ? { value: item.id, label, description }
          : { value: item.id, label },
      );
    }

    const filtered = filterByLabel(items, ctx.q).sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    return { items: filtered, hasMore: result.nextLink !== null };
  },
};
