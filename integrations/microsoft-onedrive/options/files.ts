import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  type OptionItem,
  type OptionsResolver,
} from "@/services/options/types";
import {
  driveItemsList,
  type DriveItemsListResult,
} from "@/integrations/microsoft-onedrive/api/driveItemsList";
import type { DriveItem } from "@/integrations/microsoft-onedrive/api/types";
import {
  PAGE_SIZE,
  filterByLabel,
  formatModified,
  mapOneDriveOptionsError,
  requireOneDriveIntegration,
} from "./_shared";

/**
 * `microsoft-onedrive:files` options resolver.
 *
 * A FLAT file picker that finds files DIRECTLY, root-first — unlike
 * `microsoft-onedrive:items`, which lists one chosen folder's children and so
 * needs a `parentItemId` parent (and misses root-level files + files in any
 * other folder). Backs `get_file.itemId` so authors (and the read smoke) can
 * select a file without first drilling into a folder.
 *
 * Discovery strategy (all READ-ONLY — only `driveItemsList`, never a mutation):
 *   1. List the drive ROOT children and keep the FILES. If root has ANY file,
 *      return those (cheap — a single call, root-level files first).
 *   2. ONLY if root has NO files, descend ONE level into a BOUNDED number of
 *      root folders (`MAX_FOLDERS_SCANNED`), appending each folder's files,
 *      until a page is filled or the folder budget is exhausted.
 * A file that exists at root or one level down is therefore found regardless of
 * whether the FIRST root folder happens to be empty (the old items-cascade bug).
 *
 * Auth: refreshable → `refreshAndRetry` (the OneDrive resolver pattern).
 *
 * Mapping (file DriveItem → OptionItem):
 *   - `value`: item `id` (the DriveItem id `get_file` consumes as `itemId`).
 *   - `label`: `name` when non-empty, else `id`.
 *   - `description`: `mimeType` (+ a `Modified YYYY-MM-DD` hint when present).
 * FOLDERS are intentionally excluded (this is a file picker); no download URL /
 * file content is read or surfaced.
 *
 * `hasMore`: true when the root page had more, or folders remained unscanned.
 *
 * Error sanitization: a ROOT-list auth error → `INTEGRATION_DISCONNECTED`;
 * other root-list errors → `PROVIDER_ERROR`. Per-folder traversal errors are
 * best-effort SKIPPED (one inaccessible subfolder never aborts the search or
 * causes a false failure).
 */

const MAX_FOLDERS_SCANNED = 12;

function isFile(item: DriveItem): boolean {
  return item.file !== undefined && item.folder === undefined;
}

export const microsoftOneDriveFilesResolver: OptionsResolver = {
  source: "microsoft-onedrive:files",
  provider: "microsoft-onedrive",
  requiresIntegration: true,
  async resolve(ctx) {
    const integration = requireOneDriveIntegration(ctx);

    const listChildren = (parentItemId?: string): Promise<DriveItemsListResult> =>
      refreshAndRetry({
        accountId: integration.accountId,
        provider: "microsoft-onedrive",
        providerAccountId: integration.providerAccountId,
        apiCall: (accessToken) =>
          driveItemsList({ accessToken, parentItemId, top: PAGE_SIZE }),
      });

    // 1. Root children. A failure here is fatal (sanitized).
    let root: DriveItemsListResult;
    try {
      root = await listChildren();
    } catch (err) {
      mapOneDriveOptionsError(err);
    }

    const files: DriveItem[] = root.items.filter(isFile);
    const folders = root.items.filter((i) => i.folder !== undefined);

    // 2. ONLY when root produced no files, descend one bounded level into root
    // folders until we fill a page or run out of folder budget. (Root files are
    // returned as-is — root-level first, single call.)
    let scanned = 0;
    if (files.length === 0) {
      for (const folder of folders) {
        if (files.length >= PAGE_SIZE || scanned >= MAX_FOLDERS_SCANNED) break;
        if (typeof folder.id !== "string" || folder.id.length === 0) continue;
        scanned += 1;
        try {
          const child = await listChildren(folder.id);
          for (const item of child.items) if (isFile(item)) files.push(item);
        } catch {
          // Best-effort: an inaccessible / vanished subfolder (NotFoundError or
          // any transient per-folder error) is skipped, never a false failure.
          continue;
        }
      }
    }

    const items: OptionItem[] = [];
    for (const file of files) {
      if (typeof file.id !== "string" || file.id.length === 0) continue;
      const label =
        typeof file.name === "string" && file.name.length > 0 ? file.name : file.id;
      const mime = file.file?.mimeType;
      const modified = formatModified(file.lastModifiedDateTime);
      const description =
        mime && mime.length > 0
          ? modified
            ? `${mime} — ${modified}`
            : mime
          : modified;
      items.push(description ? { value: file.id, label, description } : { value: file.id, label });
    }

    const hasMore = root.nextLink !== null || scanned < folders.length;
    return { items: filterByLabel(items, ctx.q).slice(0, PAGE_SIZE), hasMore };
  },
};
