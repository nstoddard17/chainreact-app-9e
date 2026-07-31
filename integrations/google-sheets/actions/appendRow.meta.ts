import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:append_row`.
 *
 * SHEETS-GUIDED-CONFIG-1 reworked this surface. It previously mirrored
 * the runtime schema literally — a free-text A1 `range` box and a blind
 * positional chip list — because the schema had no tab field to hang a
 * column resolver on. That was recorded as a deferred product decision
 * in `docs/slices/phase-5/spreadsheet-config-redesign-closeout.md`
 * §"Secondary targets"; the guided-config plan
 * (`docs/slices/phase-5/spreadsheet-guided-config/plan.md` §10, D1)
 * resolved it: the schema gained an OPTIONAL `sheetName`, so the normal
 * path can ask which tab and derive the range.
 *
 * Fields:
 *   - `spreadsheetId`     (required) — combobox from
 *                          `google-sheets:spreadsheets`.
 *   - `sheetName`         (required in the builder) — combobox from
 *                          `google-sheets:sheets`, dependent on the
 *                          spreadsheet. OPTIONAL at runtime, so every
 *                          pre-slice saved config still validates and
 *                          runs; the builder asks for it because it is
 *                          the `dependsOn` parent the columns resolver
 *                          needs and the input the derived range comes
 *                          from.
 *   - `values`            (required) — `spreadsheet-rows`, the existing
 *                          column-aware editor, reading REAL header
 *                          names from `google-sheets:columns`. Commits
 *                          the same positional array as before: header
 *                          names are how the cells are LABELLED, not a
 *                          new save shape. No `batchRowsField` — Sheets
 *                          has no multi-row append action, and the
 *                          editor hides its mode toggle without one.
 *   - `valueInputOption`  (required, Q11) — RAW vs USER_ENTERED.
 *                          Authors choose explicitly: V1 silently
 *                          defaulted to RAW which surprised users with
 *                          formula content. Deliberately carries NO
 *                          `defaultValue`; the guided step marks
 *                          USER_ENTERED as recommended without
 *                          pre-selecting it, so the choice stays the
 *                          user's and readiness can name it as missing.
 *   - `insertDataOption`  (required select, defaults to INSERT_ROWS).
 *                          Mirrors the schema's `.default("INSERT_ROWS")`;
 *                          Q11-safe because INSERT_ROWS preserves
 *                          existing data rather than overwriting.
 *   - `range`             (required, ADVANCED) — still the only value
 *                          sent to the API, so runtime behavior is
 *                          unchanged. Derived from the selected tab for
 *                          the normal path; a deliberately hand-written
 *                          range is never overwritten by a tab change.
 *
 * Outputs match `appendRow.ts:return` — structural counters only
 * (`{spreadsheetId, tableRange, updatedRange, updatedRows,
 * updatedColumns, updatedCells}`). Nothing user-content; nothing
 * sensitive.
 */
export const googleSheetsAppendRowMeta: ActionMeta = {
  key: "google-sheets:append_row",
  provider: "google-sheets",
  type: "append_row",
  displayName: "Append Row",
  description:
    "Add one new row to the bottom of a Google Sheets tab, filling in each column by name. Required choice: treat values as if you typed them into the sheet, or store them exactly as plain text.",
  category: "data",
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
      label: "Tab",
      description:
        "Which tab inside that spreadsheet the row is added to. We read this tab's first row to work out its columns, so you never have to type a cell range.",
      type: "combobox",
      optionsSource: "google-sheets:sheets",
      dependsOn: "spreadsheetId",
      required: true,
      allowManualEntry: true,
      placeholder: "Select spreadsheet first",
    },
    {
      name: "values",
      label: "Row values",
      description:
        "What goes in each column of the new row. Leave a column blank to keep that cell empty. With 'parse as typed' below, Sheets treats numbers, dates and formulas as if you had typed them in.",
      type: "spreadsheet-rows",
      optionsSource: "google-sheets:columns",
      dependsOn: ["spreadsheetId", "sheetName"],
      required: true,
    },
    {
      name: "valueInputOption",
      label: "How should numbers, dates and formulas be treated?",
      description:
        "Required — we don't choose this for you, because the two answers write different things into your sheet.",
      type: "select",
      required: true,
      options: [
        {
          value: "USER_ENTERED",
          label: "Like something you typed in",
          description:
            "\"7/31/2026\" becomes a real date, \"=SUM(A1:A9)\" becomes a working formula.",
        },
        {
          value: "RAW",
          label: "Exactly as plain text",
          description:
            "Everything stays literal text — nothing is converted or calculated.",
        },
      ],
    },
    {
      name: "insertDataOption",
      label: "What if there are already rows below your table?",
      description:
        "Sheets appends below the table it finds. This decides what happens to anything already sitting in the way.",
      type: "select",
      required: true,
      defaultValue: "INSERT_ROWS",
      options: [
        {
          value: "INSERT_ROWS",
          label: "Push them down and slot the new row in",
          description: "Nothing in your sheet is lost.",
        },
        {
          value: "OVERWRITE",
          label: "Write over whatever is there",
          description:
            "Faster, but it replaces existing cells. This can permanently erase data on a sheet that already has content below the table.",
        },
      ],
    },
    {
      name: "range",
      label: "Cell range",
      description:
        "Set from your tab automatically. Only change this if your table doesn't start at the top-left of the sheet. Uses A1 notation, for example 'Email log'!A:F.",
      type: "text",
      required: true,
      advanced: true,
      placeholder: "'Email log'!A:F",
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the row was appended to (echoed).",
    },
    {
      name: "tableRange",
      type: "string",
      description:
        "A1 range Google identified as the existing table (the data block Sheets appended below), or null when there is no existing table (e.g. an empty sheet). Useful for debugging append placement.",
      nullable: true,
    },
    {
      name: "updatedRange",
      type: "string",
      description:
        "A1 range of the cells Google wrote (e.g. `Sheet1!A42:D42`), or null when Google omits it. Wire downstream when you need to know exactly where the new row landed.",
      nullable: true,
    },
    {
      name: "updatedRows",
      type: "number",
      description: "Count of rows written (always 1 for a single-row append).",
    },
    {
      name: "updatedColumns",
      type: "number",
      description: "Count of distinct columns written (== `values.length`).",
    },
    {
      name: "updatedCells",
      type: "number",
      description: "Total cells written (== updatedRows × updatedColumns).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Appends data to a Google Sheet — visible to anyone with view access; can overwrite when insertDataOption is OVERWRITE.",
};
