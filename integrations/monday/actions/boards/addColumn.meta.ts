import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `add_column` ActionMeta — Slice 3.MONDAY-6.
 *
 * `columnType` is free text (Monday has ~30 ColumnType values + ships
 * new ones; the runtime validates server-side). `defaults` is paste-JSON
 * (the column-aware editor is future polish — D-MON7).
 */
export const mondayAddColumnMeta: ActionMeta = {
  key: "monday:add_column",
  provider: "monday",
  type: "add_column",
  displayName: "Add Column",
  description:
    "Add a column to a Monday board. Changes board structure for everyone. Column type must match Monday's ColumnType (e.g. text, status, numbers, date, people).",
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
      name: "columnTitle",
      label: "Column title",
      type: "text",
      required: true,
      placeholder: "Priority",
    },
    {
      name: "columnType",
      label: "Column type",
      description:
        "What kind of column to add — type a Monday column-type id, e.g. text, long_text, status, dropdown, numbers, date, people, checkbox.",
      type: "text",
      required: true,
      placeholder: "status",
    },
    {
      name: "defaults",
      label: "Defaults",
      description:
        'Optional type-specific config as JSON. Example for status: {"labels":{"1":"Low","2":"High"}}.',
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder: '{"labels":{"1":"Low","2":"High"}}',
    },
  ],
  outputs: [
    { name: "columnId", type: "string", description: "New column id." },
    { name: "columnTitle", type: "string", description: "Column title.", sensitive: true },
    { name: "columnType", type: "string", description: "Resolved column type." },
    { name: "boardId", type: "string", description: "Board id (echo)." },
    { name: "createdAt", type: "string", description: "Client-synthesized creation timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 200,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes board structure (adds a column visible to all board members). Recoverable by deleting the column in Monday.",
};
