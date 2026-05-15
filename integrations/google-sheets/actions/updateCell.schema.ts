import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets update_cell action
 * (Sheets 2.1 Commit 1).
 *
 * Single-cell write. Caller passes `sheetName` + `cell` separately so the
 * handler builds the A1 range as `<sheetName>!<cell>` — no implicit
 * default sheet, no multi-cell range syntax. Use `update_row` for full
 * rows or a future `batch_update` for multi-range writes.
 *
 * `cell` is validated to a strict A1 single-cell reference; ranges and
 * full columns/rows are rejected at parse time.
 *
 * `value` accepts the same primitive union as appendRow/updateRow row
 * cells (string | number | boolean | null). `null` is an explicit
 * "blank this cell" choice; `undefined` (missing field) is rejected.
 *
 * Q11 — `valueInputOption` is REQUIRED, no hidden default. Same rule as
 * append_row / update_row: workflow author chooses RAW (literal — even
 * "=SUM(...)" stays a string) vs USER_ENTERED (parses formulas, dates,
 * numbers as if a human typed them). V1 silently defaulted to
 * USER_ENTERED in updateCell which surprised users with formula content;
 * V2 forces the choice.
 *
 * Strict mode rejects unknown fields — V1's kitchen-sink shape (e.g.
 * `cellAddress`, raw API body) does not leak in.
 */
const A1_SINGLE_CELL = /^[A-Za-z]+[0-9]+$/;

export const UpdateCellConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    sheetName: z.string().min(1, "sheetName is required."),
    cell: z
      .string()
      .min(1, "cell is required.")
      .regex(
        A1_SINGLE_CELL,
        "cell must be an A1-style single-cell reference (e.g. A1, B5, AA10).",
      ),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    valueInputOption: z.enum(["RAW", "USER_ENTERED"]),
  })
  .strict();

export type UpdateCellConfig = z.infer<typeof UpdateCellConfigSchema>;
