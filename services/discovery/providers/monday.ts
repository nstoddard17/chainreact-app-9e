import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday.com discovery sub-registry — Slice 3.MONDAY-6.
 *
 * Per-provider grouping of the 24 Monday action meta imports — mirrors
 * `services/discovery/providers/google-docs.ts` /
 * `services/discovery/providers/microsoft-onenote.ts` /
 * `services/discovery/providers/mailchimp.ts`. Central registry
 * validation (`ActionMetaSchema.parse` + duplicate-key rejection) still
 * happens in `services/discovery/_registry.ts` — this file is purely an
 * import grouping.
 *
 * **Coverage:** 24 actions, 0 triggers.
 *
 * **Staged-trigger rationale (intentional, NOT a gap):** Monday's full
 * 24-action surface is complete in MONDAY-6 and `monday` is flipped into
 * COVERED_PROVIDERS here. The 5 Monday webhook triggers (new_item,
 * column_changed, item_moved, new_subitem, new_update) land in MONDAY-7
 * via Monday's `create_webhook` lifecycle (`webhookTrigger` on the
 * manifest stays `false` until then). This is the same actions-first
 * staged arc Discord (DISCORD-4 actions → DISCORD-6/7 triggers) and
 * Google Docs (GDOCS-4 actions → GDOCS-5 triggers) followed — the
 * COVERED_PROVIDERS coverage test gates on 1:1 handler↔meta for ACTIONS
 * and does not require trigger metas.
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
