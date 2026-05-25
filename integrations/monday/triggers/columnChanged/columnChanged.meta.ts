import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `monday:column_changed` — Slice 3.MONDAY-7.
 *
 * Webhook-activated. With NO column filter, activation subscribes to
 * Monday's board-wide `change_column_value`. When the optional `columnId`
 * filter is set, activation subscribes to `change_specific_column_value`
 * with a `config` filter (Monday API-Version 2025-04). Low risk —
 * observational.
 *
 * The `boardId → columnId` cascade reuses the existing `monday:columns`
 * resolver (board-scoped). `payloadShape` mirrors
 * `triggers/columnChanged/normalize.ts`.
 */
export const mondayColumnChangedTriggerMeta: TriggerMeta = {
  key: "monday:column_changed",
  provider: "monday",
  type: "column_changed",
  displayName: "Column Value Changed",
  description:
    "Fires when a column value changes on the configured board. Optionally filter to a single column. Backed by a Monday webhook (change_column_value, or change_specific_column_value when a column filter is set).",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Board to watch for column changes.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "columnId",
      label: "Column (optional)",
      description:
        "When set, only fire for changes to this column. When blank, fires for any column change on the board.",
      type: "combobox",
      optionsSource: "monday:columns",
      dependsOn: "boardId",
      required: false,
      placeholder: "Select a board first",
    },
  ],
  payloadShape: [
    { name: "changeKind", type: "string", description: "Always 'column_changed'." },
    { name: "itemId", type: "string", description: "Item whose column changed." },
    {
      name: "itemName",
      type: "string",
      description: "Item name (when present). Sensitive — item titles can carry PII.",
      sensitive: true,
    },
    { name: "boardId", type: "string", description: "Board the change occurred on." },
    { name: "columnId", type: "string", description: "Id of the changed column." },
    {
      name: "columnTitle",
      type: "string",
      description: "Title of the changed column (when present). Sensitive — can reveal business field names.",
      sensitive: true,
    },
    {
      name: "previousValue",
      type: "unknown",
      description: "Prior column value (string or object; when present). Sensitive — carries column data.",
      sensitive: true,
    },
    {
      name: "newValue",
      type: "unknown",
      description: "New column value (string or object; when present). Sensitive — carries column data.",
      sensitive: true,
    },
    { name: "changedAt", type: "string", description: "Change timestamp (when present)." },
    { name: "changedById", type: "string", description: "Monday user id who made the change (when present)." },
  ],
  displayOrder: 20,
};
