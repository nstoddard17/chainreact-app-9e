import { z } from "zod";

/**
 * Resolved-config schema for the Excel create_worksheet action.
 *
 * Adds a new worksheet to a workbook with a caller-supplied name.
 * Slice 15 requires the name (V1's behavior of letting Graph auto-name
 * was deferred — predictable downstream references matter).
 */
export const CreateWorksheetConfigSchema = z
  .object({
    workbookId: z.string().min(1),
    name: z.string().min(1).max(31),
  })
  .strict();

export type CreateWorksheetConfig = z.infer<
  typeof CreateWorksheetConfigSchema
>;
