import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Dropbox discovery sub-registry — Slice 3.DROPBOX-4 (actions) +
 * DROPBOX-5 (trigger).
 *
 * Per-provider grouping of the 11 Dropbox action meta imports + the 1
 * webhook trigger meta — mirrors `services/discovery/providers/monday.ts` /
 * `services/discovery/providers/microsoft-onenote.ts`. Central registry
 * validation (`ActionMetaSchema.parse` / `TriggerMetaSchema.parse` +
 * duplicate-key rejection) still happens in
 * `services/discovery/_registry.ts`; this file is purely an import
 * grouping.
 *
 * **Coverage:** 11 actions, 1 webhook trigger (`new_file`).
 *
 * **Trigger arc (DROPBOX-5):** the `new_file` trigger ships via Dropbox's
 * APP-LEVEL webhook + per-account cursor reconciliation — NOT the
 * per-workflow `create_webhook` pattern used by Monday/HubSpot. One URL in
 * the Dropbox App Console serves the whole app; the global
 * `/api/webhooks/dropbox` route verifies `X-Dropbox-Signature` and
 * reconciles per changed account. The activation hook
 * (`registerActivation("dropbox", "new_file", …)`) seeds a `list_folder`
 * cursor for first-poll-miss protection, satisfying the
 * `trigger-meta-activation-invariant` test WITHOUT a
 * `SHARED_INFRA_EXEMPT_KEYS` entry. The manifest's
 * `capabilities.webhookTrigger` flips `true` in this slice.
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

// triggers/ (DROPBOX-5) — 1 webhook trigger.
import { dropboxNewFileTriggerMeta } from "@/integrations/dropbox/triggers/newFile/newFile.meta";

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

/**
 * Dropbox webhook trigger metas (DROPBOX-5) — 1 trigger, displayOrder 10:
 *   10 - new_file (app-level webhook + per-account cursor reconciliation)
 */
export const DROPBOX_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  dropboxNewFileTriggerMeta,
];
