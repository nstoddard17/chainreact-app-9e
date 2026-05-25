import { z } from "zod";

/**
 * Zod schema for the Excel updated_table_row polling trigger.
 *
 * Table-keyed: Graph assigns stable `index` values per table row that
 * remain pinned to the row across mid-table insertions/deletions. Hash
 * diff fires when a row's content changes — unlike `updated_row`,
 * shifts caused by neighbor inserts/deletes do NOT spuriously fire.
 *
 * Snapshot shape is shared with `new_table_row` (`{rowHashes, rowCount,
 * updatedAt}`); the key is Graph's stable `index`.
 */
export const ExcelUpdatedTableRowConfigSchema = z.object({
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

export type ExcelUpdatedTableRowConfig = z.infer<
  typeof ExcelUpdatedTableRowConfigSchema
>;
