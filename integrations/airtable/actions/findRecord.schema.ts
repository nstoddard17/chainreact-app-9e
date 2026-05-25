import { z } from "zod";

/**
 * Resolved-config schema for the Airtable `find_record` action.
 *
 * "Find" semantically allows zero results — the action returns
 * `{ found: false, record: null }` rather than throwing. V2 trusts
 * the user's `filterByFormula` verbatim (V1's keyword / dateFilter
 * convenience builders are dropped per Slice 10 plan).
 *
 * Q11 — `filterByFormula` is required. Without it, `find_record`
 * would degenerate into "first record in the table" which is too
 * surprising; the schema layer forces an explicit formula. Workflow
 * authors who want "first record" can pass `"TRUE()"` explicitly.
 */
export const FindRecordConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    filterByFormula: z.string().min(1),
  })
  .strict();

export type FindRecordConfig = z.infer<typeof FindRecordConfigSchema>;
