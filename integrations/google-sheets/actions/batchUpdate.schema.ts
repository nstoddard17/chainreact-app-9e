import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets batch_update action
 * (Sheets 2.2 Commit 2).
 *
 * Multi-range cell write via `spreadsheets.values.batchUpdate`. Typed
 * `updates: Array<{ range, values }>` input — no V1 simple-mode
 * `cellN`/`valueN` UI chrome, no JSON-string updates mode, no raw
 * `requests[]` passthrough. Per accepted plan Decision 1.
 *
 * Q11 — `valueInputOption` is REQUIRED, no hidden default. Same rule
 * as `update_cell` / `update_row` / `append_row`: workflow author
 * chooses RAW (literal — even "=SUM(...)" stays a string) vs
 * USER_ENTERED (parses formulas, dates, numbers as if a human typed
 * them). V1 hardcoded "USER_ENTERED" — V2 forces the choice.
 *
 * Each `range` MUST include a sheet-name prefix (e.g. "Sheet1!A1:B2").
 * V1 checked this post-hoc; V2 fails at parse time via regex. This
 * matches `update_row` / `clear_range` semantics (ranges are always
 * fully-qualified A1 with sheet prefix; the cell-actions `cell` field
 * is the only place where sheetName is provided separately).
 *
 * Cell values: same union as `update_cell` / `update_row` /
 * `append_row` — `string | number | boolean | null`. Inner-array
 * lengths are NOT validated (Sheets pads short rows; long rows spill
 * into adjacent columns — caller's choice). Outer `values` must be
 * at least one row.
 *
 * `BATCH_UPDATE_MAX_RANGES = 100` — bigger batches risk request size
 * limits + per-request quota + runs-table jsonb size. Sane default
 * pinned at the schema layer.
 *
 * Strict mode rejects unknown fields — V1 field names (`inputMode`,
 * `cell1`..`cell10`, `value1`..`value10`, `sheetName`, raw
 * `requests[]`, stringified-JSON `updates`) all fail at parse time.
 */
export const BATCH_UPDATE_MAX_RANGES = 100;

/** A1 with mandatory sheet prefix: `<anything>!<a1-cell-or-range>`. */
const A1_WITH_SHEET_PREFIX = /^[^!]+!.+$/;

const CellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const UpdateEntrySchema = z
  .object({
    range: z
      .string()
      .min(1, "update range is required.")
      .regex(
        A1_WITH_SHEET_PREFIX,
        "update range must include a sheet-name prefix (e.g. \"Sheet1!A1:B2\").",
      ),
    values: z
      .array(z.array(CellValueSchema))
      .min(1, "update values must be a non-empty 2D array."),
  })
  .strict();

export const BatchUpdateConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    valueInputOption: z.enum(["RAW", "USER_ENTERED"]),
    updates: z
      .array(UpdateEntrySchema)
      .min(1, "updates must be a non-empty array.")
      .max(
        BATCH_UPDATE_MAX_RANGES,
        `updates may contain at most ${BATCH_UPDATE_MAX_RANGES} entries.`,
      ),
  })
  .strict();

export type BatchUpdateConfig = z.infer<typeof BatchUpdateConfigSchema>;
