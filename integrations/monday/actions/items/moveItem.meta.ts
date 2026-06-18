import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `move_item` ActionMeta — Slice 3.MONDAY-6.
 *
 * board → item AND board → targetGroup cascades.
 */
export const mondayMoveItemMeta: ActionMeta = {
  key: "monday:move_item",
  provider: "monday",
  type: "move_item",
  displayName: "Move Item",
  description: "Move a Monday item to a different group via move_item_to_group.",
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
    {
      name: "targetGroupId",
      sensitivity: "recipient",
      label: "Target group",
      type: "combobox",
      optionsSource: "monday:groups",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "Moved item id." },
    { name: "itemName", type: "string", description: "Item name.", sensitive: true },
    { name: "boardId", type: "string", description: "Board id (echo)." },
    { name: "targetGroupId", type: "string", description: "Resolved target group id." },
    {
      name: "targetGroupTitle",
      type: "string",
      description: "Target group title.",
      sensitive: true,
    },
    { name: "movedAt", type: "string", description: "Client-synthesized move timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Moves an item to another group. Recoverable by moving it back to its original group.",
};
