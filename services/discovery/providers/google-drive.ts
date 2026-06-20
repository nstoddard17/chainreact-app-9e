import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Google Drive discovery sub-registry — Slice 4.GDRIVE-META-2.
 *
 * Per-provider extraction of the Drive meta imports so the central
 * `services/discovery/_registry.ts` stays manageable (same pattern as
 * `providers/google-calendar.ts` / `providers/microsoft-teams.ts` /
 * `providers/microsoft-onedrive.ts`). The central registry spreads
 * `GOOGLE_DRIVE_ACTION_METAS` / `GOOGLE_DRIVE_TRIGGER_METAS`; module-load
 * validation + duplicate-key rejection happen centrally — this file is
 * import grouping only.
 *
 * **Coverage:** 7 actions + 1 webhook trigger. Field names are camelCase to
 * mirror the Drive runtime Zod schemas 1:1 (drift fails the meta-coverage
 * structural test now that `google-drive` is in `COVERED_PROVIDERS`).
 * Slice 4.GDRIVE-READ-2 added two read-only actions (`get_file_metadata`,
 * `search_files`); `search_files.folderId` reuses the same
 * `google-drive:folders` resolver, `get_file_metadata.fileId` is typeable.
 *
 * **Resolver wiring (REUSES the already-shipped `google-drive:folders`
 * resolver — no new resolver work):**
 *   - `parentFolderId` (upload/create) → google-drive:folders (no dep).
 *   - `folderId` (list + trigger filter) → google-drive:folders (no dep).
 *   - `newParentFolderId` (move) → google-drive:folders (no dep, required).
 *   - Trigger `fileId` (watch target, default "root") → google-drive:folders.
 *   - `fileId` on move/delete → typeable text (`google-drive:files`
 *     resolver DEFERRED; trigger/upstream-fed).
 * **NO UI-scope schema additions** — every picker parent is already a real
 * field. GDRIVE-META-2 is pure additive metadata; no runtime/schema touch.
 *
 * **Risk:** `upload_file` / `create_folder` / `move_file` medium;
 * `list_files` low; **`delete_file` high + isDestructive +
 * requiresConfirmation in BOTH `permanent` modes** (irreversible perm OR
 * recoverable-but-auto-purged-after-~30-days trash — Marcus decision;
 * mirrors OneDrive `delete_item` / Airtable `delete_record` / GCal
 * `delete_event`).
 *
 * **FileRef DEFERRED (mirror OneDrive)** — `upload_file.content` is a
 * textarea string (utf8/base64); `producesFileRef:false` /
 * `consumesFileRef:false` on all 5. Future GDRIVE-FILEREF runtime slice
 * can promote uploads to consume FileRef and downloads to produce one.
 *
 * **Sensitive (plan-marked):** `list_files.files` bulk read (Drive's default
 * `files.list` response carries owner emails / per-file PII; mirrors Notion
 * `results` / Gmail `messages` / GCal `events` precedent). Drive trigger
 * `name` NOT marked (title-like; mirrors Teams `subject` / GCal `summary` —
 * sign-off decision documented). Drive `webViewLink` NOT marked
 * (auth-gated deeplink, not a signed URL — mirrors OneDrive `webUrl` /
 * GCal `htmlLink`).
 *
 * **Deferred / rejected resolvers (none referenced):** `google-drive:files`
 * (fileId typeable / trigger-fed), `google-drive:items` (no consumer),
 * `google-drive:shared_drives` (no driveId in any schema).
 *
 * The `file_changed` trigger registers its activation in
 * `triggers/fileChanged/index.ts` (loaded by `integrations/_registry.ts`),
 * so the trigger-meta-activation-invariant passes without an exemption.
 */

import { googleDriveUploadFileMeta } from "@/integrations/google-drive/actions/uploadFile.meta";
import { googleDriveCreateFolderMeta } from "@/integrations/google-drive/actions/createFolder.meta";
import { googleDriveListFilesMeta } from "@/integrations/google-drive/actions/listFiles.meta";
import { googleDriveMoveFileMeta } from "@/integrations/google-drive/actions/moveFile.meta";
import { googleDriveDeleteFileMeta } from "@/integrations/google-drive/actions/deleteFile.meta";
import { googleDriveGetFileMetadataMeta } from "@/integrations/google-drive/actions/getFileMetadata.meta";
import { googleDriveSearchFilesMeta } from "@/integrations/google-drive/actions/searchFiles.meta";

import { googleDriveFileChangedTriggerMeta } from "@/integrations/google-drive/triggers/fileChanged/fileChanged.meta";

/** Drive action metas in displayOrder (10..70). */
export const GOOGLE_DRIVE_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  googleDriveUploadFileMeta,
  googleDriveCreateFolderMeta,
  googleDriveListFilesMeta,
  googleDriveMoveFileMeta,
  googleDriveDeleteFileMeta,
  googleDriveGetFileMetadataMeta,
  googleDriveSearchFilesMeta,
];

/** Drive trigger metas — 1 watch-based webhook trigger. */
export const GOOGLE_DRIVE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  googleDriveFileChangedTriggerMeta,
];
