import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Eden discovery sub-registry (EDEN-4). Groups Eden's action metadata so the central
 * `_metaInventory.ts` stays manageable (same pattern as `providers/trello.ts`). The central
 * registry spreads `EDEN_ACTION_METAS`; module-load validation + duplicate-key rejection happen
 * centrally. Eden has no triggers (no Eden webhook/event API) — see docs/providers/eden/.
 *
 * Batch 1 (live-certified): 7 actions — 4 reads + 3 board/note writes.
 */
import { edenListWorkspacesMeta } from "@/integrations/eden/actions/workspaces/listWorkspaces.meta";
import { edenListSchedulesMeta } from "@/integrations/eden/actions/scheduling/listSchedules.meta";
import { edenListScheduledPostsMeta } from "@/integrations/eden/actions/scheduling/listScheduledPosts.meta";
import { edenCreateBoardMeta } from "@/integrations/eden/actions/boards/createBoard.meta";
import { edenCreateNoteMeta } from "@/integrations/eden/actions/notes/createNote.meta";
import { edenReadBoardMeta } from "@/integrations/eden/actions/boards/readBoard.meta";
import { edenTrashBoardMeta } from "@/integrations/eden/actions/boards/trashBoard.meta";
// Batch 2 — notes area (EDEN-5).
import { edenReadNoteMeta } from "@/integrations/eden/actions/notes/readNote.meta";
import { edenAppendToNoteMeta } from "@/integrations/eden/actions/notes/appendToNote.meta";
import { edenUpdateNoteMeta } from "@/integrations/eden/actions/notes/updateNote.meta";
import { edenRenameNoteMeta } from "@/integrations/eden/actions/notes/renameNote.meta";
import { edenCreateStickyNoteMeta } from "@/integrations/eden/actions/notes/createStickyNote.meta";
import { edenListNotesMeta } from "@/integrations/eden/actions/notes/listNotes.meta";
import { edenSearchItemsMeta } from "@/integrations/eden/actions/notes/searchItems.meta";
import { edenListBoardsMeta } from "@/integrations/eden/actions/boards/listBoards.meta";
import { edenListBoardItemsMeta } from "@/integrations/eden/actions/boards/listBoardItems.meta";
import { edenRenameBoardMeta } from "@/integrations/eden/actions/boards/renameBoard.meta";
import { edenSaveLinksToBoardMeta } from "@/integrations/eden/actions/boards/saveLinksToBoard.meta";
// Batch 2 — content / creator / prompt reads.
import { edenListPromptsMeta } from "@/integrations/eden/actions/library/listPrompts.meta";
import { edenGetPromptMeta } from "@/integrations/eden/actions/library/getPrompt.meta";
import { edenExportSkillMeta } from "@/integrations/eden/actions/library/exportSkill.meta";
import { edenReadContentMeta } from "@/integrations/eden/actions/content/readContent.meta";
import { edenListCapturesMeta } from "@/integrations/eden/actions/content/listCaptures.meta";
import { edenListHighlightsMeta } from "@/integrations/eden/actions/content/listHighlights.meta";
import { edenListCreatorListsMeta } from "@/integrations/eden/actions/creators/listCreatorLists.meta";
import { edenResolveCreatorMeta } from "@/integrations/eden/actions/creators/resolveCreator.meta";
import { edenResearchCreatorMeta } from "@/integrations/eden/actions/creators/researchCreator.meta";
import { edenFollowingOverviewMeta } from "@/integrations/eden/actions/creators/followingOverview.meta";
// Batch 3 — scheduling writes (EDEN-6): 8 actions, no triggers.
import { edenCreateSchedulingDraftMeta } from "@/integrations/eden/actions/scheduling/createSchedulingDraft.meta";
import { edenReadScheduledPostMeta } from "@/integrations/eden/actions/scheduling/readScheduledPost.meta";
// CS-6D — schedule_post / publish_post_now / update_scheduled_post are DEFERRED
// (hidden): their success path is not live-certified (the cert account has no
// connected social accounts), so they are withheld from discovery + execution
// registration until certified. Their implementation files (`.meta.ts`/
// `.schema.ts`/`.ts`) remain in the repo as orphans (rule 14). Do NOT re-add
// them without a live success capture. See docs/providers/eden/deferred-actions.md.
import { edenReschedulePostMeta } from "@/integrations/eden/actions/scheduling/reschedulePost.meta";
import { edenSetFirstCommentMeta } from "@/integrations/eden/actions/scheduling/setFirstComment.meta";
import { edenCancelScheduledPostMeta } from "@/integrations/eden/actions/scheduling/cancelScheduledPost.meta";

export const EDEN_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  edenListWorkspacesMeta,
  edenListSchedulesMeta,
  edenListScheduledPostsMeta,
  edenCreateBoardMeta,
  edenReadBoardMeta,
  edenCreateNoteMeta,
  edenTrashBoardMeta,
  // Batch 2 — notes.
  edenReadNoteMeta,
  edenAppendToNoteMeta,
  edenUpdateNoteMeta,
  edenRenameNoteMeta,
  edenCreateStickyNoteMeta,
  edenListNotesMeta,
  edenSearchItemsMeta,
  // Batch 2 — boards.
  edenListBoardsMeta,
  edenListBoardItemsMeta,
  edenRenameBoardMeta,
  edenSaveLinksToBoardMeta,
  // Batch 2 — content / creator / prompt reads.
  edenListPromptsMeta,
  edenGetPromptMeta,
  edenExportSkillMeta,
  edenReadContentMeta,
  edenListCapturesMeta,
  edenListHighlightsMeta,
  edenListCreatorListsMeta,
  edenResolveCreatorMeta,
  edenResearchCreatorMeta,
  edenFollowingOverviewMeta,
  // Batch 3 — scheduling writes (EDEN-6). schedule_post / publish_post_now /
  // update_scheduled_post are DEFERRED (hidden, CS-6D) — not live-certified.
  edenCreateSchedulingDraftMeta,
  edenReadScheduledPostMeta,
  edenReschedulePostMeta,
  edenSetFirstCommentMeta,
  edenCancelScheduledPostMeta,
];
