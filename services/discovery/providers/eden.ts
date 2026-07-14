import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Eden discovery sub-registry (EDEN-4). Groups Eden's action metadata so the central
 * `_metaInventory.ts` stays manageable (same pattern as `providers/trello.ts`). The central
 * registry spreads `EDEN_ACTION_METAS`; module-load validation + duplicate-key rejection happen
 * centrally. Eden has no triggers (no Eden webhook/event API) — see docs/providers/eden/.
 *
 * Batch 1 (live-certified): 7 actions — 4 reads + 3 board/note writes.
 */
import { edenListWorkspacesMeta } from "@/integrations/eden/actions/listWorkspaces.meta";
import { edenListSchedulesMeta } from "@/integrations/eden/actions/listSchedules.meta";
import { edenListScheduledPostsMeta } from "@/integrations/eden/actions/listScheduledPosts.meta";
import { edenCreateBoardMeta } from "@/integrations/eden/actions/createBoard.meta";
import { edenCreateNoteMeta } from "@/integrations/eden/actions/createNote.meta";
import { edenReadBoardMeta } from "@/integrations/eden/actions/readBoard.meta";
import { edenTrashBoardMeta } from "@/integrations/eden/actions/trashBoard.meta";

export const EDEN_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  edenListWorkspacesMeta,
  edenListSchedulesMeta,
  edenListScheduledPostsMeta,
  edenCreateBoardMeta,
  edenReadBoardMeta,
  edenCreateNoteMeta,
  edenTrashBoardMeta,
];
