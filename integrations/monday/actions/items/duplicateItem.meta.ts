import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `duplicate_item` ActionMeta — Slice 3.MONDAY-6.
 */
export const mondayDuplicateItemMeta: ActionMeta = {
  key: "monday:duplicate_item",
  provider: "monday",
  type: "duplicate_item",
  displayName: "Duplicate Item",
  description: "Clone a Monday item within its board, optionally copying its updates.",
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
      name: "withUpdates",
      label: "Copy updates",
      description: "When on, the source item's updates (comments) are copied into the clone.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "newItemId", type: "string", description: "Id of the duplicated item." },
    {
      name: "newItemName",
      type: "string",
      description: "Name of the duplicated item.",
      sensitive: true,
    },
    { name: "originalItemId", type: "string", description: "Source item id (echo)." },
    { name: "boardId", type: "string", description: "Board id." },
    { name: "groupId", type: "string", description: "Group id of the new item." },
    { name: "createdAt", type: "string", description: "Creation timestamp of the clone." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a copy of an item. Recoverable by deleting the new item.",
};
