import { z } from "zod";

/**
 * Resolved-config schema for the Excel `rename_worksheet` action.
 *
 * Microsoft Excel parity Commit 2. PATCHes a worksheet's display name.
 *
 * Required fields:
 *   - `workbookId`             — DriveItem id (Graph workbook target).
 *   - `worksheetName`          — CURRENT name (used to address the
 *                                target in the Graph URL). Matches the
 *                                slice-15 V2 convention (every other
 *                                Excel action / trigger / wrapper
 *                                identifies worksheets by name).
 *   - `newWorksheetName`       — NEW name. Excel allows up to 31
 *                                characters per worksheet name; the
 *                                schema enforces that ceiling so the
 *                                wrapper sees a bounded value.
 *
 * `.strict()` — no V1 legacy fields, no raw Graph body passthrough.
 * Workflow authors who want to also reposition or hide the worksheet
 * compose follow-up actions in a future slice; this commit only
 * renames.
 *
 * No silent fallback to "the first worksheet" — `worksheetName` is
 * required. No silent name sanitization beyond what Excel / Graph
 * itself rejects (Graph 400 on illegal characters propagates verbatim).
 */
export const RenameWorksheetConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    worksheetName: z.string().min(1, "worksheetName is required."),
    newWorksheetName: z
      .string()
      .min(1, "newWorksheetName is required.")
      .max(31, "newWorksheetName must be 31 characters or fewer."),
  })
  .strict();

export type RenameWorksheetConfig = z.infer<
  typeof RenameWorksheetConfigSchema
>;
