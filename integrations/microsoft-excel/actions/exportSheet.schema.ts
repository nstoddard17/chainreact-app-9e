import { z } from "zod";

/**
 * Resolved-config schema for the Excel export_sheet (Get Rows) action.
 *
 * Read-only. Returns the parsed cell-value matrix of a worksheet's used
 * range. `hasHeaders` controls whether the first row is treated as
 * column-header labels (then each subsequent row becomes a keyed object)
 * or as data (then each row becomes a positional array).
 *
 * `hasHeaders` is a behavior switch, not a high-risk default per CLAUDE.md
 * Q11 — defaulting to `true` is acceptable and matches V1's exportSheet.ts.
 */
export const ExportSheetConfigSchema = z
  .object({
    workbookId: z.string().min(1),
    worksheetName: z.string().min(1),
    /** When true, row 0 becomes the header label set. Default true. */
    hasHeaders: z.boolean().default(true),
    /**
     * Optional limit on returned data rows (after header row, if any).
     * Slice 15 enforces server-side: handler slices the values array
     * after the Graph fetch — Graph itself returns the full usedRange.
     */
    limit: z.number().int().min(1).max(10000).optional(),
  })
  .strict();

export type ExportSheetConfig = z.infer<typeof ExportSheetConfigSchema>;
