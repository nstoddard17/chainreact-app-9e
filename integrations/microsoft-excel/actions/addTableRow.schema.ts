import { z } from "zod";

/**
 * Resolved-config schema for the Excel add_table_row action.
 *
 * Appends a single row to the bottom of a named Excel table. The handler:
 *   1. GETs `/tables/{name}/columns` so it can align the supplied values
 *      to the table's left-to-right column order.
 *   2. POSTs `{ values: [<aligned-row>] }` to `/tables/{name}/rows`.
 *
 * `values` may be supplied as:
 *   - A flat array (positional, already aligned with the table's column
 *     order), OR
 *   - A `Record<string, unknown>` keyed by column name, which the handler
 *     resolves into a positional array using the columns endpoint.
 *
 * Stable row ids (assigned by Graph) make this trigger the safe surface
 * for change-tracking, distinct from the position-keyed worksheet rows.
 */
export const AddTableRowConfigSchema = z
  .object({
    workbookId: z.string().min(1),
    tableName: z.string().min(1),
    values: z.union([
      z.array(z.unknown()).min(1),
      z.record(z.string(), z.unknown()),
    ]),
  })
  .strict();

export type AddTableRowConfig = z.infer<typeof AddTableRowConfigSchema>;
