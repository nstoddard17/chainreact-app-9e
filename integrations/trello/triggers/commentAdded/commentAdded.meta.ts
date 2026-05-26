import type { TriggerMeta } from "@/contracts/triggerMeta";
import { TRELLO_TRIGGER_PAYLOAD_SHAPE } from "../_shared/payloadShape";

/**
 * Builder metadata for `trello:comment_added` — Slice 4.TRELLO-META-3.
 *
 * Per-board webhook (`registerActivation("trello","comment_added",…)`).
 * Fires when a comment is added to a card; `commentText` carries the body
 * (sensitive). `boardId` is the only runtime config.
 */
export const trelloCommentAddedTriggerMeta: TriggerMeta = {
  key: "trello:comment_added",
  provider: "trello",
  type: "comment_added",
  displayName: "Comment Added",
  description:
    "Fires when a comment is added to a card on the selected board. The comment body is in commentText.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The board to watch for new comments.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [...TRELLO_TRIGGER_PAYLOAD_SHAPE],
  displayOrder: 40,
};
