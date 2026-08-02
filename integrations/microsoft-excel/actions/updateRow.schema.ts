import { z } from "zod";

/**
 * Resolved-config schema for the Excel `update_row` action.
 *
 * Microsoft Excel parity Commit 1. Header-based update: the caller
 * supplies a row number and an object keyed by column-HEADER-NAME; the
 * handler reads the worksheet's first-row headers at execute time
 * (P-X1 accepted handler-internal pattern per parity-microsoft-excel.md
 * §10), maps each key to a column letter, and PATCHes only the named
 * cells (preserving other cells in the row).
 *
 * Required fields:
 *   - `workbookId`        — DriveItem id (Graph workbook target).
 *   - `worksheetName`     — worksheet within the workbook.
 *   - `rowNumber`         — 1-based row number to update (>= 1).
 *   - `values`            — `Record<columnHeader, cellValue>`,
 *                           at least one entry. Keys MUST match
 *                           existing headers exactly (case-sensitive);
 *                           the handler fails loudly on unknown
 *                           columns (no silent skip, no silent create).
 *
 * `.strict()` — V1 fields rejected:
 *   - `matchColumn` / `matchValue` / `updateMultiple` — V1's
 *     search-then-update mode. Not ported: search semantics belong
 *     in a separate `find_row` action (deferred). `update_row` takes
 *     an explicit row number only.
 *   - `updateMapping` — V1's column-name → value object. V2 uses the
 *     standardized `values` field name and rejects array shapes
 *     (V1 supported both `{col: val}` and `[{column, value}]` —
 *     V2 standardizes on object form).
 *   - `column_*` flat fields — V1 UI sent each column as a
 *     `column_<Name>: value` config field which the handler then
 *     re-bundled. V2 requires the bundled `values` shape upstream.
 *
 * V1 had silent behavior we deliberately reject:
 *   - V1 logged + skipped unknown columns ([deleteRow.ts:180-182]).
 *     V2 throws (per Marcus acceptance: "Do not silently ignore
 *     unknown fields").
 *   - V1 had no silent column-creation; V2 preserves that
 *     (per Marcus: "Do not silently create missing columns").
 */
export const UpdateRowConfigSchema = z
  .object({
    workbookId: z.string().min(1, "workbookId is required."),
    worksheetName: z.string().min(1, "worksheetName is required."),
    /**
     * SPREADSHEET-GUIDED-CONFIG-S3 — the minimum is 2, not 1.
     *
     * Row 1 is the worksheet's HEADING row: it is what every column name in
     * `values` is resolved against. Updating it renames the user's columns
     * and breaks every workflow pointed at that sheet, so it is not a valid
     * target for this action — the schema says so rather than leaving a
     * destructive configuration merely discouraged. (The handler repeats
     * the check against the used range's real first row, which need not be
     * row 1.)
     *
     * This is the one saved configuration S3 stops accepting, and
     * deliberately: `rowNumber: 1` could only ever have overwritten the
     * headings. No migration — the stored shape is unchanged.
     */
    rowNumber: z
      .number()
      .int()
      .min(
        2,
        "Row 1 holds the worksheet's column headings and can't be updated. Choose a row from 2 onwards.",
      ),
    /**
     * Column-header → cell-value map. The handler resolves header names
     * to column letters via a fresh worksheet usedRange read at execute
     * time. Empty object is rejected — "update zero columns" is a no-op
     * we don't want to silently accept.
     */
    values: z
      .record(z.string().min(1), z.unknown())
      .refine(
        (v) => Object.keys(v).length > 0,
        "values must include at least one column entry.",
      ),
  })
  .strict();

export type UpdateRowConfig = z.infer<typeof UpdateRowConfigSchema>;
