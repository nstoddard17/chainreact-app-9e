import { z } from "zod";

/**
 * Resolved-config schema for the Excel `read_range` action
 * (Slice 4.EXCEL-READ-2).
 *
 * Reads a caller-specified A1 range on a worksheet (distinct from
 * `export_sheet`, which reads the whole used range). `address` is the
 * worksheet-local A1 rectangle — the worksheet is pinned separately so no
 * sheet-qualified prefix is used.
 *
 * The address MUST be a BOUNDED rectangle: each endpoint carries both a
 * column letter AND a row number. Full-column (`A:A`) and full-row (`1:1`)
 * addresses are rejected at parse time so a workflow can't request an
 * unbounded slab of the sheet. The handler additionally caps the number of
 * output rows as defense-in-depth.
 *
 * Strict mode rejects unknown fields.
 */
const A1_BOUNDED_RANGE = /^\$?[A-Za-z]{1,3}\$?[0-9]+(?::\$?[A-Za-z]{1,3}\$?[0-9]+)?$/;

export const ReadRangeConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    worksheetName: z.string().min(1, "worksheetName is required."),
    address: z
      .string()
      .min(1, "address is required.")
      .regex(
        A1_BOUNDED_RANGE,
        "address must be a bounded A1 range (e.g. A1 or A1:D10); full columns (A:A) and full rows (1:1) are not allowed.",
      ),
  })
  .strict();

export type ReadRangeConfig = z.infer<typeof ReadRangeConfigSchema>;
