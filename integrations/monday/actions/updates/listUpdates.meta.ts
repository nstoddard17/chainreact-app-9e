import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `list_updates` ActionMeta — Slice 3.MONDAY-6. Pure read.
 *
 * `boardId` UI-scope narrower drives the item picker. Update bodies are
 * sensitive — the `updates` array is flagged at the parent level.
 */
export const mondayListUpdatesMeta: ActionMeta = {
  key: "monday:list_updates",
  provider: "monday",
  type: "list_updates",
  displayName: "List Updates",
  description: "List the updates (comments) on a Monday item.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Used to populate the item picker.",
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
      name: "limit",
      label: "Limit",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "Item id." },
    { name: "itemName", type: "string", description: "Item name.", sensitive: true },
    {
      name: "updates",
      type: "array",
      description: "Updates with body, creator, timestamps.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of updates." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 130,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
