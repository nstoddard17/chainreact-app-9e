import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `monday:item_moved` — Slice 3.MONDAY-7.
 *
 * Webhook-activated (`create_webhook` event `item_moved_to_any_group`).
 * Low risk — observational. `payloadShape` mirrors
 * `triggers/itemMoved/normalize.ts`.
 */
export const mondayItemMovedTriggerMeta: TriggerMeta = {
  key: "monday:item_moved",
  provider: "monday",
  type: "item_moved",
  displayName: "Item Moved to Group",
  description:
    "Fires when an item moves between groups on the configured board. Backed by a Monday webhook subscribed to the item_moved_to_any_group event.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Board to watch for item moves.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'item_moved'." },
    { name: "itemId", type: "string", description: "Item that was moved." },
    {
      name: "itemName",
      type: "string",
      description: "Item name (when present). Sensitive — item titles can carry PII.",
      sensitive: true,
    },
    { name: "boardId", type: "string", description: "Board the move occurred on." },
    { name: "previousGroupId", type: "string", description: "Group the item moved from (when present)." },
    { name: "currentGroupId", type: "string", description: "Group the item moved to (when present)." },
    { name: "movedAt", type: "string", description: "Move timestamp (when present)." },
    { name: "movedById", type: "string", description: "Monday user id who moved the item (when present)." },
  ],
  displayOrder: 30,
};
