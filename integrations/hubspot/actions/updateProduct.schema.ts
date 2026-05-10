import { z } from "zod";

/**
 * `update_product` action schema — Slice 13 Batch 2.
 *
 * Required: `productId`. At least one property field must be present
 * (handler enforces).
 */
export const UpdateProductConfigSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    price: z.string().min(1).optional(),
    hs_sku: z.string().min(1).optional(),
    hs_cost_of_goods_sold: z.string().min(1).optional(),
    hs_recurring_billing_period: z.string().min(1).optional(),
  })
  .strict();

export type UpdateProductConfig = z.infer<typeof UpdateProductConfigSchema>;
