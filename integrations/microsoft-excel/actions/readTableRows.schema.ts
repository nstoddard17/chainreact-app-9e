import { z } from "zod";

/**
 * Resolved-config schema for the Excel `read_table_rows` action
 * (Slice 4.EXCEL-READ-2).
 *
 * Reads one page of rows from an Excel table. `top` caps the page at the
 * Graph `$top` boundary (1..500, default 100) — single page only, the
 * handler never auto-follows `@odata.nextLink`. Strict mode rejects unknown
 * fields.
 */
export const ReadTableRowsConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    tableName: z.string().min(1, "tableName is required."),
    /** Optional page cap, 1..500. Default 100. One page only. */
    top: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type ReadTableRowsConfig = z.infer<typeof ReadTableRowsConfigSchema>;
