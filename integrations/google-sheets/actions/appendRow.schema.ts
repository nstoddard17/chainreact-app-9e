import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets append_row action.
 *
 * Q11 — `valueInputOption` is REQUIRED, no hidden default. Workflow
 * authors choose explicitly between RAW (literal strings, including the
 * literal "=SUM(...)" if it shows up) and USER_ENTERED (parses formulas,
 * dates, numbers as if a human typed them). V1 silently defaulted to
 * RAW which surprised users with formula content; V2 forces the choice.
 *
 * `values` is a single row's column values, expressed as an array. The
 * caller knows the column order. Multi-row append is a deliberate
 * non-goal for Slice 5 Batch 1; if real workflows need it, expand the
 * schema to accept `string[][]` later (non-breaking — single-row
 * callers keep working).
 *
 * `range` uses Google's A1 notation:
 *   - "Sheet1!A:A" or "Sheet1!A:Z"  — Google detects the table from this
 *                                     column range and appends below
 *                                     the bottom row. Most common.
 *   - "Sheet1"                       — Google finds the bottom of the
 *                                     entire sheet. Less precise.
 *
 * `sheetName` (SHEETS-GUIDED-CONFIG-1) is the tab the guided builder
 * targets. It is OPTIONAL and additive by design:
 *   - The handler does not read it — `range` remains the single value
 *     sent to the API, so execution semantics are unchanged.
 *   - It exists so the builder has a real `dependsOn` parent for the
 *     `google-sheets:columns` resolver (a free-text `range` cannot be
 *     one) and so the normal path derives `range` instead of asking a
 *     business user to hand-write A1 notation.
 *   - Optional, with NO default, precisely so every configuration saved
 *     before this slice keeps parsing and running untouched. Making it
 *     required — or defaulting it — would invalidate live workflows.
 *
 * Strict mode rejects unknown fields.
 */
export const AppendRowConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    range: z.string().min(1, "range is required."),
    /**
     * Builder-side destination tab. Optional for backward compatibility;
     * see the note above. Never sent to the Sheets API.
     */
    sheetName: z.string().min(1, "sheetName must not be empty.").optional(),
    values: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .min(1, "values must be a non-empty array."),
    /**
     * Q11 required: RAW (literal) vs USER_ENTERED (parse formulas/dates).
     */
    valueInputOption: z.enum(["RAW", "USER_ENTERED"]),
    /** Defaults to "INSERT_ROWS" — pushes existing rows down rather than overwriting. */
    insertDataOption: z
      .enum(["INSERT_ROWS", "OVERWRITE"])
      .default("INSERT_ROWS"),
  })
  .strict();

export type AppendRowConfig = z.infer<typeof AppendRowConfigSchema>;
