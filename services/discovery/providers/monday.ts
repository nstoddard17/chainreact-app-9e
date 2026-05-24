import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Monday.com discovery sub-registry — Slice 3.MONDAY-6 (actions) +
 * MONDAY-7 (triggers).
 *
 * Per-provider grouping of the 24 Monday action meta imports + the 5
 * webhook trigger meta imports — mirrors
 * `services/discovery/providers/google-docs.ts` /
 * `services/discovery/providers/microsoft-onenote.ts` /
 * `services/discovery/providers/mailchimp.ts`. Central registry
 * validation (`ActionMetaSchema.parse` / `TriggerMetaSchema.parse` +
 * duplicate-key rejection) still happens in
 * `services/discovery/_registry.ts` — this file is purely an import
 * grouping.
 *
 * **Coverage:** 24 actions, 5 webhook triggers.
 *
 * **Trigger arc (MONDAY-7):** the 5 Monday webhook triggers (new_item,
 * column_changed, item_moved, new_subitem, new_update) ship via Monday's
 * `create_webhook` / `delete_webhook` lifecycle. Each registers an
 * activation + deactivation hook in its `triggers/<event>/index.ts`, so
 * the `trigger-meta-activation-invariant` test is satisfied without an
 * exemption. The manifest's `capabilities.webhookTrigger` flips `true`
 * in the same slice.
 *
 * Action metas in displayOrder (10..240). Ordered so the library panel
 * surfaces item operations first (most-used), then updates, boards,
 * users, files:
 *   10  - create_item        130 - list_updates
 *   20  - update_item        140 - list_boards
 *   30  - get_item           150 - get_board
 *   40  - list_items         160 - create_board
 *   50  - search_items       170 - duplicate_board
 *   60  - move_item          180 - create_group
 *   70  - duplicate_item     190 - list_groups
 *   80  - archive_item       200 - add_column
 *   90  - delete_item        210 - list_users
 *   100 - create_subitem     220 - get_user
 *   110 - list_subitems      230 - add_file
 *   120 - create_update      240 - download_file
 */

// items/
import { mondayCreateItemMeta } from "@/integrations/monday/actions/items/createItem.meta";
import { mondayUpdateItemMeta } from "@/integrations/monday/actions/items/updateItem.meta";
import { mondayGetItemMeta } from "@/integrations/monday/actions/items/getItem.meta";
import { mondayListItemsMeta } from "@/integrations/monday/actions/items/listItems.meta";
import { mondaySearchItemsMeta } from "@/integrations/monday/actions/items/searchItems.meta";
import { mondayMoveItemMeta } from "@/integrations/monday/actions/items/moveItem.meta";
import { mondayDuplicateItemMeta } from "@/integrations/monday/actions/items/duplicateItem.meta";
import { mondayArchiveItemMeta } from "@/integrations/monday/actions/items/archiveItem.meta";
import { mondayDeleteItemMeta } from "@/integrations/monday/actions/items/deleteItem.meta";
import { mondayCreateSubitemMeta } from "@/integrations/monday/actions/items/createSubitem.meta";
import { mondayListSubitemsMeta } from "@/integrations/monday/actions/items/listSubitems.meta";
// updates/
import { mondayCreateUpdateMeta } from "@/integrations/monday/actions/updates/createUpdate.meta";
import { mondayListUpdatesMeta } from "@/integrations/monday/actions/updates/listUpdates.meta";
// boards/
import { mondayListBoardsMeta } from "@/integrations/monday/actions/boards/listBoards.meta";
import { mondayGetBoardMeta } from "@/integrations/monday/actions/boards/getBoard.meta";
import { mondayCreateBoardMeta } from "@/integrations/monday/actions/boards/createBoard.meta";
import { mondayDuplicateBoardMeta } from "@/integrations/monday/actions/boards/duplicateBoard.meta";
import { mondayCreateGroupMeta } from "@/integrations/monday/actions/boards/createGroup.meta";
import { mondayListGroupsMeta } from "@/integrations/monday/actions/boards/listGroups.meta";
import { mondayAddColumnMeta } from "@/integrations/monday/actions/boards/addColumn.meta";
// users/
import { mondayListUsersMeta } from "@/integrations/monday/actions/users/listUsers.meta";
import { mondayGetUserMeta } from "@/integrations/monday/actions/users/getUser.meta";
// files/
import { mondayAddFileMeta } from "@/integrations/monday/actions/files/addFile.meta";
import { mondayDownloadFileMeta } from "@/integrations/monday/actions/files/downloadFile.meta";

// triggers/ (MONDAY-7) — 5 webhook triggers in displayOrder 10..50.
import { mondayNewItemTriggerMeta } from "@/integrations/monday/triggers/newItem/newItem.meta";
import { mondayColumnChangedTriggerMeta } from "@/integrations/monday/triggers/columnChanged/columnChanged.meta";
import { mondayItemMovedTriggerMeta } from "@/integrations/monday/triggers/itemMoved/itemMoved.meta";
import { mondayNewSubitemTriggerMeta } from "@/integrations/monday/triggers/newSubitem/newSubitem.meta";
import { mondayNewUpdateTriggerMeta } from "@/integrations/monday/triggers/newUpdate/newUpdate.meta";

export const MONDAY_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  mondayCreateItemMeta,
  mondayUpdateItemMeta,
  mondayGetItemMeta,
  mondayListItemsMeta,
  mondaySearchItemsMeta,
  mondayMoveItemMeta,
  mondayDuplicateItemMeta,
  mondayArchiveItemMeta,
  mondayDeleteItemMeta,
  mondayCreateSubitemMeta,
  mondayListSubitemsMeta,
  mondayCreateUpdateMeta,
  mondayListUpdatesMeta,
  mondayListBoardsMeta,
  mondayGetBoardMeta,
  mondayCreateBoardMeta,
  mondayDuplicateBoardMeta,
  mondayCreateGroupMeta,
  mondayListGroupsMeta,
  mondayAddColumnMeta,
  mondayListUsersMeta,
  mondayGetUserMeta,
  mondayAddFileMeta,
  mondayDownloadFileMeta,
];

/**
 * Monday webhook trigger metas (MONDAY-7) — displayOrder 10..50:
 *   10  - new_item        40 - new_subitem
 *   20  - column_changed   50 - new_update
 *   30  - item_moved
 */
export const MONDAY_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  mondayNewItemTriggerMeta,
  mondayColumnChangedTriggerMeta,
  mondayItemMovedTriggerMeta,
  mondayNewSubitemTriggerMeta,
  mondayNewUpdateTriggerMeta,
];
