import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `google-sheets:row_changed`.
 *
 * Webhook-activated push trigger. Activation creates a Drive
 * `files.watch` channel on the spreadsheet's Drive file id, seeds the
 * initial `lastRowCount` baseline, and (when `changeKinds` includes
 * `"updated"` or `"removed"`) snapshots per-row hashes up to
 * `snapshotRowLimit`. The Drive watch fires on the spreadsheet's
 * `modifiedTime` bumps; the pull function diffs against the prior
 * snapshot to emit one event per (row, changeKind) pair. Activation
 * registry — registered in
 * `integrations/google-sheets/triggers/rowChanged/index.ts` via
 * `registerActivation("google-sheets", "row_changed", activate)`. The
 * trigger-meta-activation-invariant test is satisfied; no exemption
 * needed.
 *
 * Config (mirrors `schema.ts`):
 *   - `spreadsheetId`     (required) — combobox from
 *                          `google-sheets:spreadsheets`.
 *   - `sheetName`         (required) — combobox from
 *                          `google-sheets:sheets`, gated on
 *                          spreadsheetId.
 *   - `headerRow`         (optional boolean, defaults to false) —
 *                          when true, row 1 is treated as headers
 *                          (surfaced into the `headers` payload field)
 *                          and `keyColumn` becomes available.
 *   - `changeKinds`       (required string-array, default `["added"]`) —
 *                          which change kinds emit events. Allowed
 *                          values: `added`, `updated`, `removed`.
 *                          string-array rather than multi-select per
 *                          the slice rule "do not add new FieldTypes";
 *                          chip input with the 3 valid values
 *                          documented in the description.
 *   - `snapshotRowLimit`  (optional number, defaults to 1000) —
 *                          bounded storage cost. Min 100, max 10000.
 *   - `keyColumn`         (optional text) — header name to use as the
 *                          stable row key (positional otherwise).
 *                          REQUIRES `headerRow: true` — schema rejects
 *                          the mismatched combination at parse time.
 *
 * Payload mirrors `normalize.ts` exactly. `rowValues` and `keyValue`
 * carry user-typed cell content — both marked sensitive (PII /
 * financial data routinely lives in sheet cells). `headers` is column
 * names (structural; like field names) and stays non-sensitive.
 * `previousValues` is always null in V2 (forward-compat field; will
 * carry pre-change values if a future slice adds value-storage).
 */
export const googleSheetsRowChangedTriggerMeta: TriggerMeta = {
  key: "google-sheets:row_changed",
  provider: "google-sheets",
  type: "row_changed",
  displayName: "Row Changed",
  description:
    "Fires when rows are added, updated, or removed in the configured Google Sheets worksheet. Backed by a Drive `files.watch` channel; the pull function diffs against a per-row hash snapshot when `changeKinds` includes `updated` or `removed`. `added`-only stays on the count-delta fast path. Optional `keyColumn` provides stable row identity across mid-sheet inserts/deletes (requires `headerRow: true`).",
  category: "data",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "spreadsheetId",
      label: "Spreadsheet",
      description:
        "Pick a Google Sheets file from your connected account. The picker lists files most-recently-modified first.",
      type: "combobox",
      optionsSource: "google-sheets:spreadsheets",
      required: true,
      placeholder: "Search spreadsheets…",
    },
    {
      name: "sheetName",
      label: "Sheet",
      description:
        "Pick a worksheet (tab) inside the chosen spreadsheet. Gated on Spreadsheet — change the spreadsheet and the sheet picker re-fetches.",
      type: "combobox",
      optionsSource: "google-sheets:sheets",
      dependsOn: "spreadsheetId",
      required: true,
      placeholder: "Select Spreadsheet first",
    },
    {
      name: "headerRow",
      label: "Header row",
      description:
        "When on, row 1 is treated as a header row — its values are emitted as `headers` in the payload, and `keyColumn` becomes available. When off, all rows are treated as data rows.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
    {
      name: "changeKinds",
      label: "Change kinds",
      description:
        "Which change kinds emit events. Allowed values (one per chip): `added`, `updated`, `removed`. Default is `added` only (fast-path count-delta). Add `updated` or `removed` to enable per-row hash snapshot tracking (uses `snapshotRowLimit` rows of storage).",
      type: "string-array",
      required: true,
      defaultValue: ["added"],
      stringArrayMaxItems: 3,
    },
    {
      name: "snapshotRowLimit",
      label: "Snapshot row limit",
      description:
        "Maximum rows tracked in the per-row hash snapshot when `changeKinds` includes `updated` or `removed`. Bounded storage cost. Min 100, max 10,000. Default 1,000. Ignored when `changeKinds` is `added`-only.",
      type: "number",
      required: false,
      numeric: { min: 100, max: 10000, integer: true, step: 100 },
      defaultValue: 1000,
    },
    {
      name: "keyColumn",
      label: "Key column",
      description:
        "Optional header name to use as the stable row key. When set, rows are identified by their value in this column rather than by position — survives mid-sheet inserts/deletes. **Requires `Header row` to be on.** Leave blank for positional row identity.",
      type: "text",
      required: false,
      placeholder: "Email",
    },
  ],
  payloadShape: [
    {
      name: "changeKind",
      type: "string",
      description: "`\"added\"` / `\"updated\"` / `\"removed\"` — which change fired the event.",
    },
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the row lives in (echoed from config).",
    },
    {
      name: "sheetName",
      type: "string",
      description: "Sheet/tab title the row lives in (echoed from config).",
    },
    {
      name: "rowIndex",
      type: "number",
      description:
        "1-indexed row number in the spreadsheet (matches the Sheets UI). Null for `removed` events because the row no longer exists at pull time.",
    },
    {
      name: "rowKey",
      type: "string",
      description:
        "Snapshot key — positional row number as string OR keyColumn value coerced to string. Workflow authors that need stable identity reference this.",
    },
    {
      name: "keyColumn",
      type: "string",
      description: "Echo of the configured `keyColumn` (null in positional mode).",
    },
    {
      name: "keyValue",
      type: "string",
      description:
        "In keyColumn mode, the row's value in the key column (coerced to string). Null in positional mode. Marked sensitive — workflows frequently use email / order id / customer id as the key.",
      sensitive: true,
    },
    {
      name: "rowValues",
      type: "array",
      description:
        "Current row values in column order. Null for `removed` events (the row no longer exists). Marked sensitive — workflows frequently load PII / financial data into sheet cells.",
      sensitive: true,
    },
    {
      name: "headers",
      type: "array",
      description:
        "Header row values when `headerRow: true` (column labels). Null when `headerRow` is off. Structural — column labels are like field names; not user data.",
    },
    {
      name: "previousValues",
      type: "array",
      description:
        "Always null in V2 (D-PreviousValues). Reserved for forward compatibility if a future slice adds pre-change value storage. Marked sensitive because the field is reserved for row-content semantics.",
      sensitive: true,
    },
  ],
  displayOrder: 20,
};
