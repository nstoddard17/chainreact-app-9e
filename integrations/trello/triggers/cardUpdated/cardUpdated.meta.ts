import type { TriggerMeta } from "@/contracts/triggerMeta";
import { TRELLO_TRIGGER_PAYLOAD_SHAPE } from "../_shared/payloadShape";

/**
 * Builder metadata for `trello:card_updated` — Slice 4.TRELLO-META-3.
 *
 * Per-board webhook (`registerActivation("trello","card_updated",…)`).
 * Fires on card field changes; `changedFields` / `oldValues` carry the
 * diff. `boardId` is the only runtime config.
 */
export const trelloCardUpdatedTriggerMeta: TriggerMeta = {
  key: "trello:card_updated",
  provider: "trello",
  type: "card_updated",
  displayName: "Card Updated",
  description:
    "Fires when a card on the selected board is updated (name, description, dates, etc.). Use changedFields / oldValues for the diff.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The board to watch for card updates.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [...TRELLO_TRIGGER_PAYLOAD_SHAPE],
  displayOrder: 20,
};
