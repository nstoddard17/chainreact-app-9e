import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets delete_row action
 * (Sheets 2.1 Commit 2).
 *
 * Single-row deletion by row number. Sheets has no native single-row
 * delete endpoint, so the handler routes through `spreadsheets.batchUpdate`
 * with one `deleteDimension` request and a `(startIndex, endIndex)` of
 * `(rowNumber - 1, rowNumber)`.
 *
 * `rowNumber` is 1-indexed, matching the Sheets UI (the first row is row
 * 1, including the header row if there is one). Validated as a positive
 * integer at parse time so the handler doesn't have to defend against
 * `0` / negatives / floats.
 *
 * V1's kitchen-sink `deleteBy: "row_number" | "range" | "column_value"`
 * router + `rowSelection: "last" | "first_data"` shortcuts + `deleteAll`
 * cascade are NOT ported. Range deletion can be done by chaining multiple
 * delete_row calls in descending order; column-value deletion composes
 * `find_row` → `delete_row` cleanly. The kitchen-sink shape is V1 chrome
 * the audit explicitly skips (parity-google-sheets.md GS-R1).
 *
 * Strict mode rejects unknown fields.
 */
export const DeleteRowConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    sheetName: z.string().min(1, "sheetName is required."),
    rowNumber: z
      .number()
      .int("rowNumber must be an integer.")
      .min(1, "rowNumber must be 1 or greater (1-indexed)."),
  })
  .strict();

export type DeleteRowConfig = z.infer<typeof DeleteRowConfigSchema>;
