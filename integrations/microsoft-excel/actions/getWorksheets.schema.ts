import { z } from "zod";

/**
 * Resolved-config schema for the Excel get_worksheets action.
 *
 * Lists the worksheets of a single workbook. `workbookId` is required —
 * caller resolves the id via `get_workbooks` (or a future data-loader).
 */
export const GetWorksheetsConfigSchema = z
  .object({
    workbookId: z.string().min(1),
  })
  .strict();

export type GetWorksheetsConfig = z.infer<typeof GetWorksheetsConfigSchema>;
