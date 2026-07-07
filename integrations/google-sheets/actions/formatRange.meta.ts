import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `google-sheets:format_range`.
 *
 * Mirrors `formatRange.schema.ts`:
 *   - `spreadsheetId`        (required) — combobox from
 *                             `google-sheets:spreadsheets`.
 *   - `sheetName`            (required) — combobox from
 *                             `google-sheets:sheets`, gated on
 *                             spreadsheetId. The handler resolves
 *                             sheetName → sheetId via
 *                             `spreadsheets.get`.
 *   - `range`                (required) — **BARE** A1 cell or range —
 *                             NO sheet-name prefix. Schema regex pins
 *                             this so the handler can combine it with
 *                             sheetName cleanly.
 *   - `backgroundColor`      (optional) — 6-digit hex (`#RRGGBB` or
 *                             `RRGGBB`).
 *   - `textColor`            (optional) — 6-digit hex.
 *   - `bold` / `italic`      (optional booleans).
 *   - `horizontalAlignment`  (optional select) — LEFT / CENTER / RIGHT.
 *   - `numberFormat`         (optional textarea paste-JSON) — Sheets'
 *                             `{type, pattern?}` object shape exactly
 *                             as the runtime schema accepts it. Surfaced
 *                             as paste-JSON (mirrors the Stripe
 *                             `automaticTax` + Notion paste-JSON pattern)
 *                             rather than flat sibling fields because
 *                             splitting it into a `select`+`text` pair
 *                             would diverge from the live schema's
 *                             nested-object shape — slice rule is "use
 *                             exact runtime field names." A future slice
 *                             can add a structured editor without a
 *                             contract break.
 *
 * Format options follow the accepted plan §10 Decision 2 subset.
 * Borders / conditional formatting / data validation / fontSize /
 * verticalAlignment / wrapStrategy / strikethrough / underline are
 * NOT supported (rejected at schema time).
 *
 * Outputs match `formatRange.ts:return` — `{spreadsheetId, sheetName,
 * sheetId, formattedRange, appliedFormat}`. Purely structural; the
 * `appliedFormat` object echoes the format options the author passed.
 *
 * Risk classification — `low`. Formatting is non-destructive of cell
 * VALUES; the cells' content is preserved and only the display
 * attributes change.
 */
export const googleSheetsFormatRangeMeta: ActionMeta = {
  key: "google-sheets:format_range",
  provider: "google-sheets",
  type: "format_range",
  displayName: "Format Range",
  description:
    "Apply cell formatting to a range via `spreadsheets.batchUpdate` (`repeatCell`). Typed subset: background color, text color, bold, italic, horizontal alignment, number format. At least one formatting option MUST be set. Cell values are preserved — only display attributes change. **Range MUST be bare A1** (no sheet-name prefix); the sheet picker provides the sheet.",
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
      name: "range",
      label: "Range",
      description:
        "**BARE** A1 cell or range — NO sheet-name prefix (the sheet is set above). Examples: `A1`, `A1:B5`, `AA10:AB12`. Sheet-prefixed ranges (`Sheet1!A1:B5`) are rejected at runtime.",
      type: "text",
      required: true,
      placeholder: "A1:B5",
    },
    {
      name: "backgroundColor",
      label: "Background color",
      description:
        "Optional 6-digit hex (`#RRGGBB` or `RRGGBB`). The handler converts to Sheets' float-channel color shape.",
      type: "text",
      required: false,
      placeholder: "#FFCC00",
    },
    {
      name: "textColor",
      label: "Text color",
      description:
        "Optional 6-digit hex (`#RRGGBB` or `RRGGBB`). Drives `userEnteredFormat.textFormat.foregroundColor`.",
      type: "text",
      required: false,
      placeholder: "#000000",
    },
    {
      name: "bold",
      label: "Bold",
      description:
        "Optional — set to bold the text in the range. Omit to leave the existing bold state untouched.",
      type: "boolean",
      required: false,
    },
    {
      name: "italic",
      label: "Italic",
      description:
        "Optional — set to italicize the text in the range. Omit to leave the existing italic state untouched.",
      type: "boolean",
      required: false,
    },
    {
      name: "horizontalAlignment",
      label: "Horizontal alignment",
      description:
        "Optional cell text alignment. Omit to leave the existing alignment untouched.",
      type: "select",
      required: false,
      options: [
        { value: "LEFT", label: "LEFT" },
        { value: "CENTER", label: "CENTER" },
        { value: "RIGHT", label: "RIGHT" },
      ],
    },
    {
      name: "numberFormat",
      label: "Number format",
      description:
        "Optional Sheets number-format object: `{\"type\":\"NUMBER|PERCENT|CURRENCY|DATE|TIME|DATE_TIME|SCIENTIFIC|TEXT\",\"pattern\":\"<optional Sheets format pattern>\"}`. Pattern follows Sheets' [number format token grammar](https://developers.google.com/sheets/api/guides/formats). Enter a JSON object or wire `{{...}}` from upstream.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: '{"type":"CURRENCY","pattern":"$#,##0.00"}',
    },
  ],
  outputs: [
    {
      name: "spreadsheetId",
      type: "string",
      description: "Spreadsheet id the format ran against (echoed).",
    },
    {
      name: "sheetName",
      type: "string",
      description: "Sheet/tab title the format ran against (echoed).",
    },
    {
      name: "sheetId",
      type: "number",
      description:
        "Numeric Sheets API sheetId the handler resolved sheetName to via `spreadsheets.get`.",
    },
    {
      name: "formattedRange",
      type: "string",
      description:
        "Combined `<sheetName>!<range>` the format was applied to — convenience scalar for downstream variable references.",
    },
    {
      name: "appliedFormat",
      type: "object",
      description:
        "Object echo of the format options the author passed (only the set options appear). Purely structural.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
