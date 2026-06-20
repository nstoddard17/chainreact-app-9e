import { z } from "zod";

/**
 * Resolved-config schema for the Excel `find_row` action
 * (Slice 4.EXCEL-READ-2).
 *
 * Finds the first table row whose value in `lookupColumn` (a HEADER NAME)
 * string-equals `lookupValue`. Reuses the table columns + rows wrappers and
 * scans one bounded page client-side (Graph has no per-row server filter for
 * tables in this surface). `maxRows` caps the page (1..500, default 100).
 *
 * `lookupValue` accepts the same primitive union as a cell value; comparison
 * is string-coerced so `"100"` matches a numeric `100`. Strict mode rejects
 * unknown fields.
 */
export const FindRowConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    tableName: z.string().min(1, "tableName is required."),
    lookupColumn: z.string().min(1, "lookupColumn is required."),
    lookupValue: z.union([z.string(), z.number(), z.boolean()]),
    /** Optional scan cap, 1..500. Default 100. One page only. */
    maxRows: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type FindRowConfig = z.infer<typeof FindRowConfigSchema>;
