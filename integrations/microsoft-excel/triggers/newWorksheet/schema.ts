import { z } from "zod";

/**
 * Zod schema for the Excel new_worksheet polling trigger.
 *
 * Snapshot stores the workbook's worksheet-name list at activation
 * time. Each tick fetches the current list and fires for any name not
 * present in the prior snapshot — closes V1's "first poll miss" bug
 * (CLAUDE.md §4 "Polling Trigger Snapshot Initialization").
 *
 * Rename semantics: Graph's `/worksheets` endpoint returns the set of
 * current names. A rename surfaces as { remove old name, add new name }
 * — the trigger fires once with the new name. This matches V1.
 */
export const ExcelNewWorksheetConfigSchema = z.object({
  workbookId: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      names: z.array(z.string()),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({ lastPolledAt: z.string().min(1) })
    .optional(),
});

export type ExcelNewWorksheetConfig = z.infer<
  typeof ExcelNewWorksheetConfigSchema
>;
