import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets read_rows action.
 *
 * `range` uses Google's A1 notation:
 *   - "Sheet1!A:Z"        — every row in columns A through Z (most common)
 *   - "Sheet1!A1:Z100"    — bounded rectangle
 *   - "Sheet1"            — entire sheet (defaults columns A:Z up to last row)
 *
 * `majorDimension` defaults to "ROWS" (rows-as-arrays — what 99% of
 * consumers want). NOT a Q11 hidden default — Google's own default is
 * also "ROWS" and the surprise factor is essentially zero.
 *
 * Strict mode rejects unknown fields so accidental leftovers from a
 * paste-in config (e.g., V1's `valueInputOption` on a read action) fail
 * fast.
 */
export const ReadRowsConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    range: z.string().min(1, "range is required."),
    majorDimension: z.enum(["ROWS", "COLUMNS"]).default("ROWS"),
    valueRenderOption: z
      .enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"])
      .optional(),
  })
  .strict();

export type ReadRowsConfig = z.infer<typeof ReadRowsConfigSchema>;
