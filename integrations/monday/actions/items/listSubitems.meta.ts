import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `list_subitems` ActionMeta — Slice 3.MONDAY-6. Pure read.
 *
 * `boardId` UI-scope narrower drives the parent-item picker.
 */
export const mondayListSubitemsMeta: ActionMeta = {
  key: "monday:list_subitems",
  provider: "monday",
  type: "list_subitems",
  displayName: "List Subitems",
  description: "List the subitems of a parent Monday item.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "The parent item's board — used to populate the parent-item picker.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "parentItemId",
      label: "Parent item",
      type: "combobox",
      optionsSource: "monday:items",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
  ],
  outputs: [
    { name: "parentItemId", type: "string", description: "Parent item id." },
    {
      name: "parentItemName",
      type: "string",
      description: "Parent item name.",
      sensitive: true,
    },
    {
      name: "subitems",
      type: "array",
      description: "Normalized subitems.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of subitems." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
