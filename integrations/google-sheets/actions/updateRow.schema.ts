import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets update_row action.
 *
 * Q11 — `valueInputOption` is REQUIRED, no hidden default (same rule as
 * append_row). RAW vs USER_ENTERED — the workflow author makes the
 * choice explicitly.
 *
 * Update overwrites the cells in `range`. Unlike append, the caller
 * passes the EXACT target range (e.g. "Sheet1!A5:Z5" to overwrite row 5).
 * If the values array is shorter than the range width, Google leaves the
 * extra cells unchanged — V2 doesn't pad or truncate at this layer.
 *
 * Strict mode rejects unknown fields.
 */
export const UpdateRowConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    range: z.string().min(1, "range is required."),
    values: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .min(1, "values must be a non-empty array."),
    valueInputOption: z.enum(["RAW", "USER_ENTERED"]),
  })
  .strict();

export type UpdateRowConfig = z.infer<typeof UpdateRowConfigSchema>;
