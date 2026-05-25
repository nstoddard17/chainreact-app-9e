import { z } from "zod";

/**
 * Zod schema for the Excel new_row (worksheet) polling trigger.
 *
 * Worksheet position-keyed: each row is identified by its 1-based row
 * index. Mid-sheet insertions can therefore appear as a chain of "new"
 * rows on the next poll; that matches V1's behavior (V1 uses the same
 * position-keyed scheme for new_row) and is acceptable for Slice 15's
 * append-driven workflows. Stable-id tracking is the job of
 * `new_table_row`.
 */
export const ExcelNewRowConfigSchema = z.object({
  workbookId: z.string().min(1),
  worksheetName: z.string().min(1),

  // Polling-state fields. `pollingEnabled` is set by the activation
  // hook. `snapshot` is established at activation time (closes V1's
  // "first poll miss" bug — see CLAUDE.md §4 "Polling Trigger Snapshot
  // Initialization") and advanced after each tick.
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

export type ExcelNewRowConfig = z.infer<typeof ExcelNewRowConfigSchema>;
