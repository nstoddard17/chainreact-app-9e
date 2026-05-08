import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets clear_range action.
 *
 * Clears cell *values* in the range. Formatting and data validation are
 * preserved (Google's documented behavior). To delete rows entirely, a
 * future delete_row action would call spreadsheets.batchUpdate — out of
 * scope for Slice 5 Batch 1.
 *
 * Strict mode rejects unknown fields.
 */
export const ClearRangeConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    range: z.string().min(1, "range is required."),
  })
  .strict();

export type ClearRangeConfig = z.infer<typeof ClearRangeConfigSchema>;
