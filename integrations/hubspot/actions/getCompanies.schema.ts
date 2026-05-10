import { z } from "zod";

/**
 * `get_companies` action schema — Slice 13 Batch 1.
 *
 * Same shape as `get_contacts`; wrapper hits the companies search
 * endpoint. Default properties: `name`, `domain`, `city`, `state`,
 * `country`, `industry`.
 */
export const GetCompaniesConfigSchema = z
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

export type GetCompaniesConfig = z.infer<typeof GetCompaniesConfigSchema>;
