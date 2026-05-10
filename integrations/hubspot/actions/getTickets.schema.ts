import { z } from "zod";

/**
 * `get_tickets` action schema — Slice 13 Batch 2.
 *
 * Same shape as get_contacts / get_companies / get_deals. Default
 * properties: subject, content, hs_pipeline, hs_pipeline_stage,
 * hs_ticket_priority.
 */
export const GetTicketsConfigSchema = z
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

export type GetTicketsConfig = z.infer<typeof GetTicketsConfigSchema>;
