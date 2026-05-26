import type { TriggerMeta } from "@/contracts/triggerMeta";
import { TRELLO_TRIGGER_PAYLOAD_SHAPE } from "../_shared/payloadShape";

/**
 * Builder metadata for `trello:member_changed` — Slice 4.TRELLO-META-3.
 *
 * Per-board webhook (`registerActivation("trello","member_changed",…)`).
 * Fires when a member is added to or removed from a card; `memberId` /
 * `memberName` / `memberAction` carry the change. `boardId` is the only
 * runtime config.
 */
export const trelloMemberChangedTriggerMeta: TriggerMeta = {
  key: "trello:member_changed",
  provider: "trello",
  type: "member_changed",
  displayName: "Member Changed",
  description:
    "Fires when a member is added to or removed from a card on the selected board. Use memberAction (added | removed).",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The board to watch for member changes.",
      type: "combobox",
      required: true,
      optionsSource: "trello:boards",
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [...TRELLO_TRIGGER_PAYLOAD_SHAPE],
  displayOrder: 50,
};
