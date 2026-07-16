import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `airtable:list_records` — Slice 4.AIRTABLE-META-3.
 * Mirrors `listRecords.schema.ts`. Read action (low risk). Field names
 * are camelCase, verbatim to the runtime Zod schema.
 *
 * Pickers: `baseId` → airtable:bases; `tableIdOrName` → airtable:tables
 * (dep baseId); `view` → airtable:views and `fields` → airtable:fields
 * (both multi-parent dep [baseId, tableIdOrName], via BUILDER-OPTIONS-1).
 * `fields` is an optional multi-select — it renders as a deferred
 * multi-select picker until Slice 3.7; leaving it blank returns all
 * fields, so the deferral does not block the action. `sort` is an
 * `object-list` (`[{field, direction?}]` — identical committed shape to
 * the runtime schema; direction optional, Airtable defaults to asc).
 *
 * Output `records[].fields` carries record cell values → sensitive
 * (the record id / createdTime are not).
 */
export const airtableListRecordsMeta: ActionMeta = {
  key: "airtable:list_records",
  provider: "airtable",
  type: "list_records",
  displayName: "List Records",
  description:
    "List records from an Airtable table, with optional formula filter, view, field subset, sort, and pagination.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "baseId",
      label: "Base",
      description: "The Airtable base to read from.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:bases",
      placeholder: "Search bases…",
    },
    {
      name: "tableIdOrName",
      label: "Table",
      description: "The table in the base. Pick a base first.",
      type: "combobox",
      required: true,
      optionsSource: "airtable:tables",
      dependsOn: "baseId",
      placeholder: "Select base first",
    },
    {
      name: "filterByFormula",
      label: "Filter by formula",
      description:
        "Only return records matching an Airtable formula, e.g. {Status}='Open'. Leave empty to return all records.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: "{Status}='Open'",
    },
    {
      name: "view",
      label: "View",
      description:
        "Optional view to scope results to. Pick a base and table first.",
      type: "combobox",
      required: false,
      optionsSource: "airtable:views",
      dependsOn: ["baseId", "tableIdOrName"],
      placeholder: "Select base + table first",
    },
    {
      name: "fields",
      label: "Fields to return",
      description:
        "Optional subset of fields to return. Leave empty to return all fields. Pick a base and table first.",
      type: "combobox",
      required: false,
      multiple: true,
      optionsSource: "airtable:fields",
      dependsOn: ["baseId", "tableIdOrName"],
      placeholder: "Select base + table first",
    },
    {
      name: "sort",
      label: "Sort",
      description: "Sort the returned records by one or more fields.",
      type: "object-list",
      required: false,
      advanced: true,
      itemFields: [
        {
          name: "field",
          label: "Field",
          description: "Field name to sort by (as it appears in Airtable).",
          type: "text",
          required: true,
          placeholder: "e.g. Name",
        },
        {
          name: "direction",
          label: "Direction",
          description: "Optional. Airtable defaults to ascending.",
          type: "select",
          required: false,
          options: [
            { value: "asc", label: "Ascending" },
            { value: "desc", label: "Descending" },
          ],
          placeholder: "Ascending (default)",
        },
      ],
    },
    {
      name: "pageSize",
      label: "Page size",
      description: "Optional number of records per page (1–100).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true },
    },
    {
      name: "maxRecords",
      label: "Max records",
      description: "Optional maximum total number of records to return.",
      type: "number",
      required: false,
      numeric: { min: 1, integer: true },
    },
    {
      name: "offset",
      label: "Page offset",
      description: "Pagination cursor from a previous run's `offset` output.",
      type: "text",
      required: false,
      advanced: true,
      placeholder: "itr…/rec…",
    },
  ],
  outputs: [
    {
      name: "records",
      type: "array",
      description: "The matched records.",
      fields: [
        { name: "id", type: "string", description: "Record id." },
        {
          name: "fields",
          type: "object",
          description: "Record cell values keyed by field name.",
          sensitive: true,
        },
        {
          name: "createdTime",
          type: "string",
          description: "ISO-8601 created timestamp.",
        },
      ],
    },
    {
      name: "offset",
      type: "string",
      description: "Pagination cursor for the next page, or null on the last page.",
    },
    { name: "count", type: "number", description: "Number of records returned." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "low",
  riskDescription: "Read-only — lists records.",
};
