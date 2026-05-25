import { z } from "zod";

/**
 * Zod schema for the Excel updated_row (worksheet) polling trigger.
 *
 * Worksheet position-keyed: each row is identified by its 1-based row
 * index. Hash diff fires when the value at a given position changes.
 *
 * Accepted limitation (matches V1): a mid-sheet row insert or delete
 * shifts subsequent rows, so their position-keyed hashes change too —
 * every shifted row appears as "updated" on the next poll. Stable-id
 * tracking lives in `updated_table_row`.
 *
 * Snapshot shape is shared with `new_row` (`{rowHashes, rowCount,
 * updatedAt}`), so an existing worksheet trigger can transparently
 * coexist on a different node id without an extra schema.
 */
export const ExcelUpdatedRowConfigSchema = z.object({
  workbookId: z.string().min(1),
  worksheetName: z.string().min(1),

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

export type ExcelUpdatedRowConfig = z.infer<typeof ExcelUpdatedRowConfigSchema>;
