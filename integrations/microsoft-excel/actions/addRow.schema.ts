import { z } from "zod";

/**
 * Resolved-config schema for the Excel `add_row` action.
 *
 * Microsoft Excel parity Commit 3 — extended with a batch mode that
 * folds V1's `microsoft_excel_action_add_multiple_rows` (parity audit
 * §7 decision). Two mutually-exclusive input shapes:
 *
 *   SINGLE-ROW (backwards-compatible, slice-15 default):
 *     - `values: unknown[]` — flat positional cell values aligned
 *       left-to-right with the worksheet's columns. Handler appends
 *       a single row at the tail of the used range. Padded with
 *       `null` / truncated to match the existing column count.
 *
 *   BATCH (new in Commit 3):
 *     - `rows: Array<Record<columnHeader, cellValue>>` — header-keyed
 *       row objects. Bounded **1..1000 rows per execution**. Handler
 *       reads the worksheet's first-row headers, validates every key
 *       in every row against them, then issues a single Graph range
 *       PATCH covering all rows at once.
 *
 * **Mutual exclusion is enforced** at the schema level — exactly one
 * of `values` / `rows` must be present. Neither → reject. Both →
 * reject. This mirrors the parity audit's accepted "no separate
 * add_multiple_rows registry entry" decision: one action, two shapes.
 *
 * **No silent chunking, no silent partial success** (audit acceptance):
 *   - 1001-row payload fails AT PARSE time (`.max(1000)`), before
 *     any Graph round-trip — workflow author sees a clear bound
 *     error rather than a Graph 400 or a multi-chunk silent split.
 *   - Empty row object inside `rows` fails AT PARSE time too
 *     (`.refine` on each row).
 *
 * `.strict()` — V1 `hasHeaders` / `inputMode: "simple" | "json"` /
 * `row1..row10` flat fields / `columnMapping` are all rejected.
 * Workflow authors who used V1's flat row1..row10 form bundle into
 * a `rows: [...]` array upstream.
 */
export const AddRowConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    worksheetName: z.string().min(1, "worksheetName is required."),
    /**
     * Single-row mode. Flat array of cell values aligned to the
     * worksheet's column order. Empty array is rejected.
     */
    values: z.array(z.unknown()).min(1).optional(),
    /**
     * Batch mode. Header-keyed row objects. Length 1..1000 inclusive.
     * Each row must have at least one column entry.
     */
    rows: z
      .array(
        z
          .record(z.string().min(1), z.unknown())
          .refine(
            (r) => Object.keys(r).length > 0,
            "rows entries must include at least one column.",
          ),
      )
      .min(1, "rows must contain at least one row.")
      .max(
        1000,
        "rows cap is 1000 per execution; split larger batches upstream.",
      )
      .optional(),
  })
  .strict()
  .refine(
    (v) => (v.values !== undefined) !== (v.rows !== undefined),
    "Provide exactly one of `values` (single row, positional) or `rows` (batch, header-keyed).",
  );

export type AddRowConfig = z.infer<typeof AddRowConfigSchema>;
