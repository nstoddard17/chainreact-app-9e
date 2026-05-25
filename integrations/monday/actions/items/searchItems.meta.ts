import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `search_items` ActionMeta — Slice 3.MONDAY-6. Pure read.
 *
 * With a `columnId`, searches by exact column value; without it,
 * substring-matches the item name. Optional group filter.
 */
export const mondaySearchItemsMeta: ActionMeta = {
  key: "monday:search_items",
  provider: "monday",
  type: "search_items",
  displayName: "Search Items",
  description:
    "Search items on a board by exact column value (pick a column) or by item name (leave column empty).",
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
      name: "columnValue",
      label: "Search value",
      description:
        "Value to match. With a column selected this is an exact column-value match; without one it's an item-name substring match.",
      type: "text",
      required: true,
      placeholder: "Done",
    },
    {
      name: "columnId",
      label: "Column (optional)",
      type: "combobox",
      optionsSource: "monday:columns",
      dependsOn: "boardId",
      required: false,
      placeholder: "Search by item name when empty",
    },
    {
      name: "groupId",
      label: "Group (filter)",
      type: "combobox",
      optionsSource: "monday:groups",
      dependsOn: "boardId",
      required: false,
      placeholder: "All groups",
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
    {
      name: "items",
      type: "array",
      description: "Matching items (normalized).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of matches." },
    { name: "columnValue", type: "string", description: "Echo of the search value." },
    { name: "boardId", type: "string", description: "Board id searched." },
    { name: "groupId", type: "string", description: "Group filter applied (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
