import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets create_spreadsheet action
 * (Sheets 2.1 Commit 3).
 *
 * Creates a new spreadsheet via `spreadsheets.create`. Bare API surface
 * only — `title` plus an optional `initialSheetName` that becomes the
 * first sheet's title. When `initialSheetName` is omitted, Google's
 * default "Sheet1" is created automatically.
 *
 * V1's chrome is NOT ported (parity-google-sheets.md GS-R10):
 *   - template chrome (budget / project / crm / inventory / calendar) —
 *     builder concern, not a workflow-runtime action.
 *   - initialData CSV prefill — composes with `update_row` /
 *     `append_row` post-create.
 *   - description-as-A1-note workaround — Google's API doesn't support
 *     spreadsheet descriptions natively; V1's note hack is too clever.
 *   - folder placement via Drive `files.update` — composes with a Drive
 *     `move_file` action.
 *   - locale / timeZone overrides — Google defaults to the user's
 *     account locale, which is what workflows want 99% of the time.
 *   - sheetNames[] multi-sheet array — Batch 1 ships single-sheet only
 *     (the audit doesn't pin multi-sheet as a high-leverage need; can
 *     expand non-breakingly).
 *
 * Strict mode rejects unknown fields — V1 field names (`description`,
 * `sheets`, `template`, `initialData`, `folder`, `locale`, `timeZone`)
 * fail at parse time so paste-in configs don't silently lose data.
 */
export const CreateSpreadsheetConfigSchema = z
  .object({
    title: z.string().min(1, "title is required."),
    initialSheetName: z
      .string()
      .min(1, "initialSheetName must be non-empty when provided.")
      .optional(),
  })
  .strict();

export type CreateSpreadsheetConfig = z.infer<
  typeof CreateSpreadsheetConfigSchema
>;
