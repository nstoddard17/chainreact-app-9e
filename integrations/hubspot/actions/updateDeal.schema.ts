import { z } from "zod";

/**
 * `update_deal` action schema — Slice 13 Batch 1.
 *
 * Required: `dealId`. At least one property field must be present
 * (handler enforces).
 */
export const UpdateDealConfigSchema = z
  .object({
    dealId: z.string().min(1),
    dealname: z.string().min(1).optional(),
    dealstage: z.string().min(1).optional(),
    pipeline: z.string().min(1).optional(),
    amount: z.string().min(1).optional(),
    closedate: z.string().min(1).optional(),
    dealtype: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    hubspot_owner_id: z.string().min(1).optional(),
  })
  .strict();

export type UpdateDealConfig = z.infer<typeof UpdateDealConfigSchema>;
