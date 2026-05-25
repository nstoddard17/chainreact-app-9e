import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox discovery sub-registry — Slice 3.DROPBOX-4 (actions only).
 *
 * Per-provider grouping of the 11 Dropbox action meta imports — mirrors
 * `services/discovery/providers/monday.ts` /
 * `services/discovery/providers/microsoft-onenote.ts`. Central registry
 * validation (`ActionMetaSchema.parse` + duplicate-key rejection) still
 * happens in `services/discovery/_registry.ts`; this file is purely an
 * import grouping.
 *
 * **Coverage:** 11 actions, 0 triggers (staged for DROPBOX-5).
 *
 * **Trigger arc (DROPBOX-5):** the single `new_file` trigger ships via
 * Dropbox's APP-LEVEL webhook + per-account cursor reconciliation — NOT
 * the per-workflow `create_webhook` pattern used by Monday/HubSpot. The
 * manifest's `capabilities.webhookTrigger` stays `false` until DROPBOX-5
 * flips it alongside the trigger meta + `/api/webhooks/dropbox` route.
 * This is a deliberate actions-first staged provider arc (same precedent
 * as Stripe / Discord / Google Docs / OneNote / Monday), NOT a missing
 * trigger gap. Trigger coverage is NOT enforced by
 * `tests/structure/discovery-meta-coverage.test.ts`.
 *
 * Action metas in displayOrder (10..110). All `category: "files"`,
 * `requiresIntegration: true`:
 *   10  - upload_file          70  - move_file
 *   20  - download_file        80  - copy_file
 *   30  - list_folder          90  - create_shared_link
 *   40  - search_files         100 - get_temporary_link
 *   50  - get_file_metadata    110 - delete_file (destructive — last)
 *   60  - create_folder
 *
 * Resolver wiring (the 2 DROPBOX-3 keys):
 *   - `dropbox:folders` (no deps, includes a synthetic Root) backs the
 *     folder-selecting fields: upload `path` (destination), list_folder
 *     `path`, search_files `path` (scope), and every UI-scope `folderPath`
 *     picker.
 *   - `dropbox:files` (dep `folderPath`) backs the file-selecting fields:
 *     download/get_file_metadata/create_shared_link/get_temporary_link/
 *     delete_file `path` and move/copy `fromPath`. The DROPBOX-3 resolver
 *     dep was renamed `path → folderPath` here so the folder picker name
 *     doesn't collide with the leaf file field (the builder keys deps by
 *     parent field NAME). Root-level files can't cascade (empty deps are
 *     dropped by the options route) — type the path manually.
 * `create_folder.path` stays a TEXT field (a new folder is being named —
 * nothing to pick); move/copy `toPath` stays TEXT (destination doesn't
 * exist yet).
 *
 * FileRef flags: `upload_file` consumesFileRef; `download_file` +
 * `get_temporary_link` produceFileRef (the latter is the signed_url arm).
 */

import { dropboxUploadFileMeta } from "@/integrations/dropbox/actions/uploadFile.meta";
import { dropboxDownloadFileMeta } from "@/integrations/dropbox/actions/downloadFile.meta";
import { dropboxListFolderMeta } from "@/integrations/dropbox/actions/listFolder.meta";
import { dropboxSearchFilesMeta } from "@/integrations/dropbox/actions/searchFiles.meta";
import { dropboxGetFileMetadataMeta } from "@/integrations/dropbox/actions/getFileMetadata.meta";
import { dropboxCreateFolderMeta } from "@/integrations/dropbox/actions/createFolder.meta";
import { dropboxMoveFileMeta } from "@/integrations/dropbox/actions/moveFile.meta";
import { dropboxCopyFileMeta } from "@/integrations/dropbox/actions/copyFile.meta";
import { dropboxCreateSharedLinkMeta } from "@/integrations/dropbox/actions/createSharedLink.meta";
import { dropboxGetTemporaryLinkMeta } from "@/integrations/dropbox/actions/getTemporaryLink.meta";
import { dropboxDeleteFileMeta } from "@/integrations/dropbox/actions/deleteFile.meta";

export const DROPBOX_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  dropboxUploadFileMeta,
  dropboxDownloadFileMeta,
  dropboxListFolderMeta,
  dropboxSearchFilesMeta,
  dropboxGetFileMetadataMeta,
  dropboxCreateFolderMeta,
  dropboxMoveFileMeta,
  dropboxCopyFileMeta,
  dropboxCreateSharedLinkMeta,
  dropboxGetTemporaryLinkMeta,
  dropboxDeleteFileMeta,
];
