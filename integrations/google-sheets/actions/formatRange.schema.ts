import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets format_range action
 * (Sheets 2.2 Commit 3).
 *
 * Applies cell formatting via `spreadsheets.batchUpdate` with a single
 * `repeatCell` request. Typed subset of Sheets' `CellFormat` shape —
 * six options accepted per the accepted plan Decision 2: background
 * color, text color, bold, italic, horizontal alignment, number
 * format.
 *
 * Range is A1 syntax WITHOUT a sheet-name prefix (sheetName is a
 * separate field). The handler resolves sheetName → numeric sheetId
 * via `spreadsheets.get` and combines with the parsed `GridRange` to
 * build the `repeatCell` request.
 *
 * At least one format option MUST be present — `.refine` rejects the
 * no-op case at parse time (V1 deferred this to runtime and returned
 * `success: false`; V2 fails earlier with a clearer error).
 *
 * Strict mode rejects:
 *   - V1 chrome: `rangeSelection` (UI shortcuts), `fontSize`,
 *     `verticalAlignment`, `wrapStrategy`, `strikethrough`, `underline`.
 *   - Deferred surface (audit §11 + plan Decision 3): `borders`,
 *     `conditionalFormatting`, `dataValidation`.
 *   - Raw escape hatches: `requests` (raw batchUpdate requests),
 *     `cellFormat` (raw Google wire-format), `userEnteredFormat`.
 *   - Unknown fields generally.
 */

/** Hex color: 6 hex digits, optional leading `#`. Case-insensitive. */
const HEX_COLOR = /^#?[0-9A-Fa-f]{6}$/;

/**
 * Bare A1 cell or range — no sheet prefix.
 *   single cell: `A1`, `AA10`, `Z99`
 *   range:       `A1:B5`, `AA10:AB12`
 *
 * Matches the A1_CELL / A1_RANGE shapes the `a1ToGridRange` helper
 * accepts; the handler re-validates via the helper to surface
 * GridRange-specific errors (e.g. inverted ranges).
 */
const A1_BARE_RANGE = /^[A-Z]+[1-9][0-9]*(:[A-Z]+[1-9][0-9]*)?$/;

const NumberFormatTypeEnum = z.enum([
  "TEXT",
  "NUMBER",
  "PERCENT",
  "CURRENCY",
  "DATE",
  "TIME",
  "DATE_TIME",
  "SCIENTIFIC",
]);

const NumberFormatSchema = z
  .object({
    type: NumberFormatTypeEnum,
    pattern: z.string().min(1).optional(),
  })
  .strict();

export const FormatRangeConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    sheetName: z.string().min(1, "sheetName is required."),
    range: z
      .string()
      .min(1, "range is required.")
      .regex(
        A1_BARE_RANGE,
        "range must be a bare A1 cell or range (e.g. 'A1' or 'A1:B5') without a sheet-name prefix.",
      ),
    backgroundColor: z
      .string()
      .regex(HEX_COLOR, "backgroundColor must be a 6-digit hex (e.g. '#RRGGBB' or 'RRGGBB').")
      .optional(),
    textColor: z
      .string()
      .regex(HEX_COLOR, "textColor must be a 6-digit hex (e.g. '#RRGGBB' or 'RRGGBB').")
      .optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    horizontalAlignment: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
    numberFormat: NumberFormatSchema.optional(),
  })
  .strict()
  .refine(
    (c) =>
      c.backgroundColor !== undefined ||
      c.textColor !== undefined ||
      c.bold !== undefined ||
      c.italic !== undefined ||
      c.horizontalAlignment !== undefined ||
      c.numberFormat !== undefined,
    {
      message:
        "format_range requires at least one formatting option (backgroundColor, textColor, bold, italic, horizontalAlignment, or numberFormat).",
    },
  );

export type FormatRangeConfig = z.infer<typeof FormatRangeConfigSchema>;
