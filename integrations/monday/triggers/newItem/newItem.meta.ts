import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `monday:new_item` — Slice 3.MONDAY-7.
 *
 * Webhook-activated. Activation creates one Monday webhook
 * (`create_webhook` event `create_item`) bound to the configured board.
 * Low risk — observational; activation creates a provider-side
 * subscription but mutates no Monday business data.
 *
 * `payloadShape` mirrors `triggers/newItem/normalize.ts`. Names/URLs are
 * marked sensitive (PII / item titles / links); opaque ids + timestamps
 * are not.
 */
export const mondayNewItemTriggerMeta: TriggerMeta = {
  key: "monday:new_item",
  provider: "monday",
  type: "new_item",
  displayName: "New Item",
  description:
    "Fires when a new item is created on the configured board. Backed by a Monday webhook subscribed to the create_item event.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Board to watch for new items.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_item'." },
    { name: "itemId", type: "string", description: "The new item's id." },
    {
      name: "itemName",
      type: "string",
      description: "The new item's name. Sensitive — item titles can carry PII.",
      sensitive: true,
    },
    { name: "boardId", type: "string", description: "Board the item was created on." },
    { name: "groupId", type: "string", description: "Group the item was created in (when present)." },
    { name: "createdAt", type: "string", description: "Creation timestamp (when present)." },
    { name: "creatorId", type: "string", description: "Monday user id of the creator (when present)." },
    {
      name: "webUrl",
      type: "string",
      description: "Direct link to the item (when present). Sensitive — access-bearing URL.",
      sensitive: true,
    },
  ],
  displayOrder: 10,
};
