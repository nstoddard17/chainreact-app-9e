import { z } from "zod";

/**
 * Resolved-config schema for the Airtable `list_records` action.
 *
 * V2 forward-passes `filterByFormula`, `sort`, `view`, `pageSize`,
 * `offset`, `fields` verbatim. V1's keywordSearch / dateFilter
 * convenience builders are dropped per Slice 10 plan §"V1 patterns
 * to skip". Workflow authors pre-compute the formula.
 *
 * `pageSize` capped at 100 (Airtable's hard ceiling). `maxRecords`
 * uncapped at the schema layer — Airtable enforces its own limits.
 *
 * `sort` is `[{ field, direction }]` — direction defaults to
 * Airtable's "asc" server-side; V2's schema makes it required at the
 * action layer when sort is supplied (Q11 — no silent default), but
 * keeps the field-level direction optional inside the entry. Wait —
 * re-reading Slice 10 plan: "V2 forward-passes sort verbatim." So
 * the schema lets direction be optional and Airtable defaults.
 * Direction is constrained to `"asc" | "desc"` when present.
 */
export const ListRecordsConfigSchema = z
  .object({
    baseId: z.string().min(1),
    tableIdOrName: z.string().min(1),
    filterByFormula: z.string().min(1).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
    maxRecords: z.number().int().min(1).optional(),
    offset: z.string().min(1).optional(),
    fields: z.array(z.string().min(1)).optional(),
    view: z.string().min(1).optional(),
    sort: z
      .array(
        z.object({
          field: z.string().min(1),
          direction: z.enum(["asc", "desc"]).optional(),
        }),
      )
      .optional(),
  })
  .strict();

export type ListRecordsConfig = z.infer<typeof ListRecordsConfigSchema>;
