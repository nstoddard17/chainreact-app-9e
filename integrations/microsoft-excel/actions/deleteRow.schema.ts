import { z } from "zod";

/**
 * Resolved-config schema for the Excel `delete_row` action.
 *
 * Microsoft Excel parity Commit 1. Deletes ONE explicit row from a
 * worksheet, shifting subsequent rows up. Single-row only (no bulk
 * range, no search-then-delete) per Marcus's audit acceptance.
 *
 * Required fields:
 *   - `workbookId`        — DriveItem id (Graph workbook target).
 *   - `worksheetName`     — worksheet within the workbook.
 *   - `rowNumber`         — 1-based row number to delete (>= 1).
 *
 * `.strict()` — V1 fields rejected (parity-microsoft-excel.md
 * acceptance #2 + "No hidden bulk delete / No search-query delete /
 * No silent no-op"):
 *   - `deleteBy` — V1 discriminator (`row_number` / `range` /
 *     `column_value`). Range + column_value modes are intentionally
 *     dropped. workflow authors who need bulk delete compose a loop
 *     upstream with `find_row` (deferred).
 *   - `startRow` / `endRow` — V1's range-delete mode. Dropped.
 *   - `matchColumn` / `matchValue` / `deleteMultiple` — V1's
 *     search-then-delete mode. Dropped — search semantics belong
 *     elsewhere.
 *
 * No silent no-op: the handler always issues a Graph DELETE against
 * the supplied row range and propagates any Graph 4xx/5xx verbatim.
 */
export const DeleteRowConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    worksheetName: z.string().min(1, "worksheetName is required."),
    rowNumber: z
      .number()
      .int()
      .min(1, "rowNumber must be a positive 1-based row number."),
  })
  .strict();

export type DeleteRowConfig = z.infer<typeof DeleteRowConfigSchema>;
