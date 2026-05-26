import type { TriggerMeta } from "@/contracts/triggerMeta";
import { TRELLO_TRIGGER_PAYLOAD_SHAPE } from "../_shared/payloadShape";

/**
 * Builder metadata for `trello:card_archived` — Slice 4.TRELLO-META-3.
 *
 * Per-board webhook (`registerActivation("trello","card_archived",…)`).
 * Fires when a card is archived on the selected board; `closed` reflects
 * the archived state. `boardId` is the only runtime config.
 */
export const trelloCardArchivedTriggerMeta: TriggerMeta = {
  key: "trello:card_archived",
  provider: "trello",
  type: "card_archived",
  displayName: "Card Archived",
  description:
    "Fires when a card is archived on the selected board. The closed field reflects the archived state.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The board to watch for archived cards.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [...TRELLO_TRIGGER_PAYLOAD_SHAPE],
  displayOrder: 60,
};
