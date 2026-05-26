import type { TriggerMeta } from "@/contracts/triggerMeta";
import { TRELLO_TRIGGER_PAYLOAD_SHAPE } from "../_shared/payloadShape";

/**
 * Builder metadata for `trello:card_moved` — Slice 4.TRELLO-META-3.
 *
 * Per-board webhook (`registerActivation("trello","card_moved",…)`).
 * Fires when a card moves between lists; `fromListId/Name` and
 * `toListId/Name` carry the move. `boardId` is the only runtime config.
 */
export const trelloCardMovedTriggerMeta: TriggerMeta = {
  key: "trello:card_moved",
  provider: "trello",
  type: "card_moved",
  displayName: "Card Moved",
  description:
    "Fires when a card is moved between lists on the selected board. Use fromList / toList for the source and destination.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The board to watch for card moves.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [...TRELLO_TRIGGER_PAYLOAD_SHAPE],
  displayOrder: 30,
};
