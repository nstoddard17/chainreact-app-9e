import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `list_items` ActionMeta — Slice 3.MONDAY-6. Pure read.
 */
export const mondayListItemsMeta: ActionMeta = {
  key: "monday:list_items",
  provider: "monday",
  type: "list_items",
  displayName: "List Items",
  description:
    "List items on a Monday board (optionally filtered to a group). Returns a single page with a cursor for the next.",
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
    {
      name: "cursor",
      label: "Next-page cursor",
      type: "text",
      required: false,
      placeholder: "Opaque token from a previous call",
    },
  ],
  outputs: [
    {
      name: "items",
      type: "array",
      description: "Normalized items on this page.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of items returned." },
    { name: "boardId", type: "string", description: "Board id." },
    { name: "boardName", type: "string", description: "Board name.", sensitive: true },
    { name: "groupId", type: "string", description: "Group filter applied (or null)." },
    { name: "hasMore", type: "boolean", description: "True when more pages exist." },
    { name: "nextCursor", type: "string", description: "Cursor for the next page (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
