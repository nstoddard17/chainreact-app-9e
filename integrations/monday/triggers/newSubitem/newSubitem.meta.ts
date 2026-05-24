import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `monday:new_subitem` — Slice 3.MONDAY-7.
 *
 * Webhook-activated (`create_webhook` event `create_subitem`). Low risk —
 * observational. `payloadShape` mirrors
 * `triggers/newSubitem/normalize.ts`.
 */
export const mondayNewSubitemTriggerMeta: TriggerMeta = {
  key: "monday:new_subitem",
  provider: "monday",
  type: "new_subitem",
  displayName: "New Subitem",
  description:
    "Fires when a new subitem is created on the configured board. Backed by a Monday webhook subscribed to the create_subitem event.",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Board to watch for new subitems.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'new_subitem'." },
    { name: "subitemId", type: "string", description: "The new subitem's id." },
    {
      name: "subitemName",
      type: "string",
      description: "The new subitem's name (when present). Sensitive — titles can carry PII.",
      sensitive: true,
    },
    { name: "parentItemId", type: "string", description: "Parent item id (when present)." },
    { name: "boardId", type: "string", description: "Board the subitem was created on." },
    { name: "createdAt", type: "string", description: "Creation timestamp (when present)." },
    { name: "creatorId", type: "string", description: "Monday user id of the creator (when present)." },
  ],
  displayOrder: 40,
};
