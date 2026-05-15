import { z } from "zod";

/**
 * Resolved-config schema for the Excel `delete_worksheet` action.
 *
 * Microsoft Excel parity Commit 2. DELETEs a worksheet from a
 * workbook. Single-worksheet only — no bulk delete, no search-and-
 * delete (the audit's accepted decision applies to the worksheet
 * surface too: explicit targeting required).
 *
 * Required fields:
 *   - `workbookId`     — DriveItem id (Graph workbook target).
 *   - `worksheetName`  — name of the worksheet to delete. Matches the
 *                        slice-15 V2 convention for every Excel
 *                        worksheet-addressed surface.
 *
 * `.strict()` — no V1 legacy fields, no raw Graph body passthrough,
 * no bulk-array form, no fallback ("delete the active sheet" / "the
 * first sheet" semantics are rejected).
 *
 * No silent no-op: Graph 404 propagates as `NotFoundError` from the
 * wrapper (worksheet doesn't exist). Trying to delete the last visible
 * worksheet yields Graph HTTP 400 — surfaces as a generic Error with
 * the Graph message preserved.
 */
export const DeleteWorksheetConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    worksheetName: z.string().min(1, "worksheetName is required."),
  })
  .strict();

export type DeleteWorksheetConfig = z.infer<
  typeof DeleteWorksheetConfigSchema
>;
