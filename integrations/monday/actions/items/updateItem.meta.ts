import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `update_item` ActionMeta — Slice 3.MONDAY-6.
 *
 * board → item AND board → column cascades. `columnValue` is a
 * paste-JSON-or-text textarea (status/person columns expect JSON).
 */
export const mondayUpdateItemMeta: ActionMeta = {
  key: "monday:update_item",
  provider: "monday",
  type: "update_item",
  displayName: "Update Item",
  description:
    "Update one or more column values on a Monday item via change_multiple_column_values.",
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
      name: "columnId",
      label: "Column",
      type: "combobox",
      optionsSource: "monday:columns",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
    {
      name: "columnValue",
      label: "Column value",
      description:
        'Value for the chosen column. Simple columns take plain text; status/person/date columns take JSON (e.g. {"label":"Done"}).',
      type: "textarea",
      required: true,
      placeholder: '{"label":"Done"}',
    },
    {
      name: "additionalColumns",
      label: "Additional columns",
      description:
        'Optional JSON map of further columns to set in the same call. Example: {"priority":{"label":"High"}}.',
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"priority":{"label":"High"}}',
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "Updated item id." },
    {
      name: "itemName",
      type: "string",
      description: "Item name returned by Monday.",
      sensitive: true,
    },
    {
      name: "updatedColumns",
      type: "array",
      description: "Column ids that were written in this call.",
    },
    { name: "updatedAt", type: "string", description: "Client-synthesized update timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Overwrites column values on an existing item. Recoverable by writing the previous values back.",
};
