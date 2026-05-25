import { z } from "zod";

/**
 * Zod schema for the Excel new_table_row polling trigger.
 *
 * Table-keyed: Graph assigns stable `index` values per table row that
 * remain pinned to the row even when other rows are inserted/deleted
 * elsewhere in the table. That stability is the property that makes
 * tables the safer surface for change-tracking than worksheets.
 *
 * Snapshot baseline is established at activation time per CLAUDE.md §4
 * "Polling Trigger Snapshot Initialization" — closes V1's "first poll
 * miss" bug.
 */
export const ExcelNewTableRowConfigSchema = z.object({
  workbookId: z.string().min(1),
  tableName: z.string().min(1),

  pollingEnabled: z.boolean().default(false),
  snapshot: z
    .object({
      rowHashes: z.record(z.string(), z.string()),
      rowCount: z.number().int().nonnegative(),
      updatedAt: z.string().min(1),
    })
    .optional(),
  polling: z
    .object({ lastPolledAt: z.string().min(1) })
    .optional(),
});

export type ExcelNewTableRowConfig = z.infer<
  typeof ExcelNewTableRowConfigSchema
>;
