import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `add_column` ActionMeta — Slice 3.MONDAY-6.
 *
 * RESOLVERS-1: `columnType` is a combobox with STATIC options for the
 * documented stable Monday `ColumnType` enum ids (Monday's column types
 * are a GraphQL enum — there is no list endpoint to back a resolver, so
 * this is meta-only; no options resolver exists or is needed).
 * `allowManualEntry: true` preserves forward-compat: Monday ships new
 * column types and the runtime schema stays a non-enum string that
 * Monday validates server-side, so a typed id (e.g. a newly shipped
 * type) still commits and runs. Enum reference:
 * https://developer.monday.com/api-reference/reference/column-types-reference
 * `defaults` is paste-JSON (the column-aware editor is future polish —
 * D-MON7).
 */

/** Documented stable Monday ColumnType enum ids (creatable via create_column). */
const MONDAY_COLUMN_TYPE_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "text", label: "Text" },
  { value: "long_text", label: "Long text" },
  { value: "numbers", label: "Numbers" },
  { value: "date", label: "Date" },
  { value: "people", label: "People" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "timeline", label: "Timeline" },
  { value: "link", label: "Link" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "rating", label: "Rating" },
  { value: "country", label: "Country" },
  { value: "hour", label: "Hour" },
  { value: "week", label: "Week" },
  { value: "world_clock", label: "World clock" },
  { value: "file", label: "Files" },
  { value: "board_relation", label: "Connect boards" },
  { value: "dependency", label: "Dependency" },
  { value: "tags", label: "Tags" },
  { value: "color_picker", label: "Color picker" },
];
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
        "What kind of column to add. Pick from Monday's standard column types, or type a column-type id directly (e.g. for a type Monday shipped after this list) — Monday validates the type when the column is created.",
      type: "combobox",
      options: MONDAY_COLUMN_TYPE_OPTIONS,
      allowManualEntry: true,
      required: true,
      placeholder: "Pick or type a column type…",
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
