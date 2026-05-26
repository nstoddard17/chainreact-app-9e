import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Trello discovery sub-registry — Slice 4.TRELLO-META-3.
 *
 * Per-provider extraction of the Trello meta imports so the central
 * `services/discovery/_registry.ts` stays manageable (same pattern as
 * `providers/airtable.ts` / `providers/microsoft-excel.ts` /
 * `providers/shopify.ts`). The central registry spreads
 * `TRELLO_ACTION_METAS` / `TRELLO_TRIGGER_METAS`; module-load validation +
 * duplicate-key rejection happen centrally — this file is import grouping
 * only.
 *
 * **Coverage:** 8 actions + 6 webhook triggers. Field names are camelCase
 * to mirror the Trello runtime Zod schemas 1:1 (drift fails the
 * meta-coverage structural test now that `trello` is in
 * `COVERED_PROVIDERS`).
 *
 * Picker wiring (resolvers from TRELLO-META-2):
 *   - `boardId` (UI-scope, optional) / `idBoard` (create_list, real) →
 *     trello:boards (no deps).
 *   - `listId` / `idList` → trello:lists (dep boardId).
 *   - `cardId` → trello:cards (dep boardId).
 *   - `idMembers` → trello:members (dep boardId, multi).
 *   - `labelId` / `idLabels` → trello:labels (dep boardId; idLabels multi).
 *   - All 6 triggers' `boardId` → trello:boards (no deps).
 * Every cascade is single-parent on `boardId` (no multi-parent needed).
 *
 * **Risk:** all 8 actions are medium writes; NONE destructive (archive_card
 * is reversible; no delete actions exist). `create_board` stays medium with
 * explicit `visibility` (public-visibility warning is inline helper text,
 * not a field-level confirmation). `add_comment.text` + `create_*.desc`
 * outputs are sensitive; trigger `cardDesc` / `commentText` / `oldValues` /
 * `body` payload fields are sensitive.
 *
 * Each trigger registers its activation in
 * `integrations/trello/triggers/<trigger>/index.ts` via
 * `registerActivation("trello", <key>, …)` (loaded by
 * `integrations/_registry.ts`), so the trigger-meta-activation-invariant
 * test is satisfied with no exemption.
 *
 * `trello:checklists` / `trello:check_items` resolvers were rejected in
 * TRELLO-META-1/2 (no runtime consumer) — no field references them.
 */

import { trelloCreateCardMeta } from "@/integrations/trello/actions/createCard.meta";
import { trelloUpdateCardMeta } from "@/integrations/trello/actions/updateCard.meta";
import { trelloMoveCardMeta } from "@/integrations/trello/actions/moveCard.meta";
import { trelloArchiveCardMeta } from "@/integrations/trello/actions/archiveCard.meta";
import { trelloAddCommentMeta } from "@/integrations/trello/actions/addComment.meta";
import { trelloAddLabelToCardMeta } from "@/integrations/trello/actions/addLabelToCard.meta";
import { trelloCreateListMeta } from "@/integrations/trello/actions/createList.meta";
import { trelloCreateBoardMeta } from "@/integrations/trello/actions/createBoard.meta";

import { trelloNewCardTriggerMeta } from "@/integrations/trello/triggers/newCard/newCard.meta";
import { trelloCardUpdatedTriggerMeta } from "@/integrations/trello/triggers/cardUpdated/cardUpdated.meta";
import { trelloCardMovedTriggerMeta } from "@/integrations/trello/triggers/cardMoved/cardMoved.meta";
import { trelloCommentAddedTriggerMeta } from "@/integrations/trello/triggers/commentAdded/commentAdded.meta";
import { trelloMemberChangedTriggerMeta } from "@/integrations/trello/triggers/memberChanged/memberChanged.meta";
import { trelloCardArchivedTriggerMeta } from "@/integrations/trello/triggers/cardArchived/cardArchived.meta";

/** Trello action metas in displayOrder (10..80). */
export const TRELLO_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  trelloCreateCardMeta,
  trelloUpdateCardMeta,
  trelloMoveCardMeta,
  trelloArchiveCardMeta,
  trelloAddCommentMeta,
  trelloAddLabelToCardMeta,
  trelloCreateListMeta,
  trelloCreateBoardMeta,
];

/** Trello trigger metas — 6 per-board webhook triggers (displayOrder 10..60). */
export const TRELLO_TRIGGER_METAS: ReadonlyArray<TriggerMeta> = [
  trelloNewCardTriggerMeta,
  trelloCardUpdatedTriggerMeta,
  trelloCardMovedTriggerMeta,
  trelloCommentAddedTriggerMeta,
  trelloMemberChangedTriggerMeta,
  trelloCardArchivedTriggerMeta,
];
