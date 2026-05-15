import { z } from "zod";

/**
 * Resolved-config schema for the Google Sheets find_row action
 * (Sheets 2.1 Commit 2).
 *
 * Composes `values.get` (full sheet read) + a client-side row scan to
 * find rows whose value in `column` matches `value`. Sheets has no
 * server-side per-row filter — a workflow searching a 10,000-row sheet
 * downloads 10,000 rows. Documented at parity-google-sheets.md R-1; the
 * audit pins this as expected (not a bug).
 *
 * `column` is a header name — the handler reads row 0 as headers and
 * resolves `column` to a column index. Column letter / numeric-index
 * shortcuts (V1 supported `*` for "all columns" + single-letter
 * shorthand) are NOT in Batch 1; they expand non-breakingly later.
 *
 * `operator` is the literal `"equals"` only in Batch 1 (audit
 * §13 cross-cutting decision). Adding `"contains"` / `"starts_with"` /
 * `"greater_than"` etc. is non-breaking — existing callers stay valid
 * because Zod treats the enum widening as a superset.
 *
 * `value` accepts the same primitive union as cell values
 * (string | number | boolean). `null` is intentionally excluded —
 * "find blank cells" is a different operation; V1's behavior was to
 * skip empty cells during scan.
 *
 * `returnAll` controls whether the handler emits the first match only
 * (default false → output `matches: [match]`, length 0 or 1) or every
 * match (true → output `matches: [match, match, ...]`). The output
 * shape is uniform — `matches[0]` works for both modes.
 *
 * Strict mode rejects unknown fields — V1's `searchColumn` /
 * `searchValue` / `matchType` field names are NOT accepted.
 */
export const FindRowConfigSchema = z
  .object({
    spreadsheetId: z.string().min(1, "spreadsheetId is required."),
    sheetName: z.string().min(1, "sheetName is required."),
    column: z.string().min(1, "column is required."),
    value: z.union([z.string(), z.number(), z.boolean()]),
    operator: z.literal("equals"),
    returnAll: z.boolean().default(false),
  })
  .strict();

export type FindRowConfig = z.infer<typeof FindRowConfigSchema>;
