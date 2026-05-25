import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets get_cell_value action
 * (Sheets 2.1 Commit 1).
 *
 * Single-cell read. Caller passes `sheetName` + `cell` separately so the
 * handler builds the A1 range as `<sheetName>!<cell>` — no implicit
 * default sheet, no range syntax leaking into the input shape (use
 * `read_rows` for arbitrary ranges).
 *
 * `cell` is validated to a strict A1 single-cell reference
 * (letter(s) + digit(s) — e.g. "A1", "B5", "AA10"). Ranges ("A1:B5"),
 * full columns ("A:A"), and full rows ("1:1") are rejected at parse time
 * so callers don't accidentally read a rectangle and expect a scalar.
 *
 * Strict mode rejects unknown fields — V1's kitchen-sink shape (e.g.
 * `cellAddress`, `valueRenderOption` options) does not leak in.
 */
const A1_SINGLE_CELL = /^[A-Za-z]+[0-9]+$/;

export const GetCellValueConfigSchema = z
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
  })
  .strict();

export type GetCellValueConfig = z.infer<typeof GetCellValueConfigSchema>;
