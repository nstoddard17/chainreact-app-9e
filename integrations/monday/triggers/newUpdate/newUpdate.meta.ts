import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `monday:new_update` — Slice 3.MONDAY-7.
 *
 * Webhook-activated (`create_webhook` event `create_update`). Low risk —
 * observational. `payloadShape` mirrors
 * `triggers/newUpdate/normalize.ts`. `body` + `posterName` are sensitive
 * (user-authored text + PII).
 */
export const mondayNewUpdateTriggerMeta: TriggerMeta = {
  key: "monday:new_update",
  provider: "monday",
  type: "new_update",
  displayName: "New Update Posted",
  description:
    "Fires when a new update (comment) is posted on an item on the configured board. Backed by a Monday webhook subscribed to the create_update event.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Board to watch for new updates.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_update'." },
    { name: "updateId", type: "string", description: "The new update's id." },
    { name: "itemId", type: "string", description: "Item the update was posted on (when present)." },
    { name: "boardId", type: "string", description: "Board the update was posted on." },
    {
      name: "body",
      type: "string",
      description: "Update text (when present). Sensitive — user-authored content can carry PII.",
      sensitive: true,
    },
    { name: "createdAt", type: "string", description: "Post timestamp (when present)." },
    { name: "posterId", type: "string", description: "Monday user id of the poster (when present)." },
    {
      name: "posterName",
      type: "string",
      description: "Display name of the poster (when present). Sensitive — PII.",
      sensitive: true,
    },
  ],
  displayOrder: 50,
};
