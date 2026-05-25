import { z } from "zod";

/**
 * `get_deals` action schema — Slice 13 Batch 1.
 *
 * Same shape as `get_contacts` / `get_companies`. Default properties:
 * `dealname`, `amount`, `dealstage`, `pipeline`, `closedate`.
 */
export const GetDealsConfigSchema = z
  .object({
    limit: z.number().int().positive().max(100).optional(),
    after: z.string().min(1).optional(),
    properties: z
      .union([z.array(z.string().min(1)), z.string().min(1)])
      .optional(),
    filterProperty: z.string().min(1).optional(),
    filterValue: z.string().min(1).optional(),
  })
  .strict();

export type GetDealsConfig = z.infer<typeof GetDealsConfigSchema>;
