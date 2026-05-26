import type { TriggerMeta } from "@/contracts/triggerMeta";
import { TRELLO_TRIGGER_PAYLOAD_SHAPE } from "../_shared/payloadShape";

/**
 * Builder metadata for `trello:new_card` — Slice 4.TRELLO-META-3.
 *
 * Per-board webhook. Activation (`registerActivation("trello","new_card",…)`
 * in `triggers/newCard/index.ts`, loaded by `integrations/_registry.ts`)
 * creates `POST /1/webhooks` bound to the configured board; the receive
 * helper filters inbound actions to card-created events. No expiry/renewal
 * (Trello webhooks are permanent). The `boardId` field is the only runtime
 * config (`activate` reads `node.config.boardId`).
 */
export const trelloNewCardTriggerMeta: TriggerMeta = {
  key: "trello:new_card",
  provider: "trello",
  type: "new_card",
  displayName: "New Card",
  description: "Fires when a card is created on the selected Trello board.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The board to watch for new cards.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [...TRELLO_TRIGGER_PAYLOAD_SHAPE],
  displayOrder: 10,
};
