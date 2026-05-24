import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `delete_item` ActionMeta — Slice 3.MONDAY-6.
 *
 * The one high-risk destructive action in the Monday surface:
 * isDestructive + requiresConfirmation + riskLevel high. Structural-only
 * output (no item name / column values echoed — D-MON4).
 */
export const mondayDeleteItemMeta: ActionMeta = {
  key: "monday:delete_item",
  provider: "monday",
  type: "delete_item",
  displayName: "Delete Item",
  description:
    "Delete a Monday item. Monday soft-deletes to a recycle bin recoverable from the UI, but ChainReact has no restore action — treat as permanent.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "itemId",
      label: "Item",
      type: "combobox",
      optionsSource: "monday:items",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "Always true on success." },
    { name: "deletedItemId", type: "string", description: "Deleted item id." },
    { name: "deletedAt", type: "string", description: "Client-synthesized deletion timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Deletes an item. Monday offers a UI restore path from the recycle bin, but ChainReact has no restore API — recovery requires manual action in Monday.",
};
