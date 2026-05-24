import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `get_item` ActionMeta — Slice 3.MONDAY-6. Pure read.
 */
export const mondayGetItemMeta: ActionMeta = {
  key: "monday:get_item",
  provider: "monday",
  type: "get_item",
  displayName: "Get Item",
  description: "Fetch a single Monday item with its column values, board, and group context.",
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
    { name: "itemId", type: "string", description: "Item id." },
    { name: "itemName", type: "string", description: "Item name.", sensitive: true },
    { name: "state", type: "string", description: "Item state (active / archived / deleted)." },
    { name: "boardId", type: "string", description: "Board id." },
    { name: "boardName", type: "string", description: "Board name.", sensitive: true },
    { name: "groupId", type: "string", description: "Group id." },
    { name: "groupTitle", type: "string", description: "Group title.", sensitive: true },
    {
      name: "columnValues",
      type: "array",
      description: "Normalized column values ({id,title,type,text,value}).",
      sensitive: true,
    },
    { name: "createdAt", type: "string", description: "Creation timestamp." },
    { name: "updatedAt", type: "string", description: "Last-update timestamp." },
    { name: "creatorId", type: "string", description: "Creator user id." },
    { name: "creatorName", type: "string", description: "Creator name.", sensitive: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
