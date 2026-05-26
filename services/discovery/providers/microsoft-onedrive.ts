import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Microsoft OneDrive discovery sub-registry — Slice 4.ONEDRIVE-META-3.
 *
 * Per-provider extraction of the OneDrive meta imports so the central
 * `services/discovery/_registry.ts` stays manageable (same pattern as
 * `providers/trello.ts` / `providers/airtable.ts` /
 * `providers/microsoft-excel.ts`). The central registry spreads
 * `MICROSOFT_ONEDRIVE_ACTION_METAS` / `MICROSOFT_ONEDRIVE_TRIGGER_METAS`;
 * module-load validation + duplicate-key rejection happen centrally — this
 * file is import grouping only.
 *
 * **Coverage:** 7 actions + 1 webhook trigger. Field names are camelCase to
 * mirror the OneDrive runtime Zod schemas 1:1 (drift fails the meta-coverage
 * structural test now that `microsoft-onedrive` is in `COVERED_PROVIDERS`).
 *
 * Picker wiring (resolvers from ONEDRIVE-META-2):
 *   - `parentItemId` (real on upload/create/list; UI-scope on
 *     get/delete/move/copy) + `targetParentItemId` (move/copy) →
 *     microsoft-onedrive:folders (no deps).
 *   - `itemId` → microsoft-onedrive:items (dep `parentItemId`).
 * Every cascade is single-parent on `parentItemId` (no multi-parent).
 *
 * **Risk:** reads (`get_file`, `list_items`) low; writes (`upload_file`,
 * `create_folder`, `move_item`, `copy_item`) medium; **`delete_item` is
 * high + isDestructive + requiresConfirmation** (Marcus decision — folder
 * delete cascades to children; recycle-bin recovery is time-limited).
 *
 * **FileRef deferred (Marcus decision):** the runtime uses content-strings +
 * `downloadUrl`-strings, not the V2 FileRef system → every meta is
 * `producesFileRef:false` / `consumesFileRef:false`; `upload_file.content`
 * is a textarea; `downloadUrl` outputs (upload/get/list-nested + the trigger
 * payload) are marked sensitive.
 *
 * The `file_changed` trigger registers its activation in
 * `triggers/fileChanged/index.ts` (loaded by `integrations/_registry.ts`),
 * so the trigger-meta-activation-invariant passes without an exemption. Its
 * `fields` are empty (whole-drive watch, no per-trigger config).
 *
 * `microsoft-onedrive:drives` was rejected in ONEDRIVE-META-1/2 (single
 * personal drive; no `driveId` in any schema) — no field references it.
 */

import { microsoftOneDriveListItemsMeta } from "@/integrations/microsoft-onedrive/actions/listItems.meta";
import { microsoftOneDriveGetFileMeta } from "@/integrations/microsoft-onedrive/actions/getFile.meta";
import { microsoftOneDriveUploadFileMeta } from "@/integrations/microsoft-onedrive/actions/uploadFile.meta";
import { microsoftOneDriveCreateFolderMeta } from "@/integrations/microsoft-onedrive/actions/createFolder.meta";
import { microsoftOneDriveMoveItemMeta } from "@/integrations/microsoft-onedrive/actions/moveItem.meta";
import { microsoftOneDriveCopyItemMeta } from "@/integrations/microsoft-onedrive/actions/copyItem.meta";
import { microsoftOneDriveDeleteItemMeta } from "@/integrations/microsoft-onedrive/actions/deleteItem.meta";

import { microsoftOneDriveFileChangedTriggerMeta } from "@/integrations/microsoft-onedrive/triggers/fileChanged/fileChanged.meta";

/** OneDrive action metas in displayOrder (10..70). */
export const MICROSOFT_ONEDRIVE_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  microsoftOneDriveListItemsMeta,
  microsoftOneDriveGetFileMeta,
  microsoftOneDriveUploadFileMeta,
  microsoftOneDriveCreateFolderMeta,
  microsoftOneDriveMoveItemMeta,
  microsoftOneDriveCopyItemMeta,
  microsoftOneDriveDeleteItemMeta,
];

/** OneDrive trigger metas — 1 whole-drive webhook trigger (file_changed). */
export const MICROSOFT_ONEDRIVE_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  microsoftOneDriveFileChangedTriggerMeta,
];
