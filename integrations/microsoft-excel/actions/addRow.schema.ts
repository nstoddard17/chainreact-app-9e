import { z } from "zod";

/**
 * Resolved-config schema for the Excel add_row action.
 *
 * Append-tail mode only in Slice 15 (V1's `prepend` + `specific_row`
 * positions are deferred). The handler:
 *   1. Fetches the worksheet's usedRange to find the current tail.
 *   2. Computes the target A1 address one row past the tail, spanning
 *      the same column count as the existing data.
 *   3. PATCHes the values to that range.
 *
 * `values` is provided as a flat array of cell values aligned to the
 * worksheet's column order (left-to-right). Length mismatch with the
 * worksheet's used-range columns is allowed — the handler pads with
 * `null` or truncates as needed (see addRow.ts).
 *
 * For an empty worksheet (no usedRange), the handler writes the row at
 * `A1` and spans the column count of `values`.
 */
export const AddRowConfigSchema = z
  .object({
    workbookId: z.string().min(1),
    worksheetName: z.string().min(1),
    /**
     * Cell values aligned left-to-right with the worksheet's columns.
     * Mixed types preserved (string / number / boolean / null).
     */
    values: z.array(z.unknown()).min(1),
  })
  .strict();

export type AddRowConfig = z.infer<typeof AddRowConfigSchema>;
