import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `create_item` ActionMeta — Slice 3.MONDAY-6.
 *
 * board → group cascade. `columnValues` is a paste-JSON textarea (the
 * column-aware editor is future polish — D-MON7).
 */
export const mondayCreateItemMeta: ActionMeta = {
  key: "monday:create_item",
  provider: "monday",
  type: "create_item",
  displayName: "Create Item",
  description:
    "Create a new item in a Monday board + group. Optionally set column values via a JSON map.",
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
      label: "Group",
      type: "combobox",
      optionsSource: "monday:groups",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
    {
      name: "itemName",
      label: "Item name",
      type: "text",
      required: true,
      placeholder: "New task",
    },
    {
      name: "columnValues",
      label: "Column values",
      description:
        'JSON-encoded column-values map. Example: {"status":{"label":"Done"},"text_col":"hello"}. Leave empty to create with no column values. Column keys come from Get Board / the Column picker on Update Item.',
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"status":{"label":"Done"}}',
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "New item id." },
    {
      name: "itemName",
      type: "string",
      description: "Item name (echoed/returned).",
      sensitive: true,
    },
    { name: "boardId", type: "string", description: "Board id the item was created in." },
    { name: "groupId", type: "string", description: "Group id the item was created in." },
    { name: "createdAt", type: "string", description: "Monday-reported creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new board item. Recoverable by chaining delete_item / archive_item downstream.",
};
