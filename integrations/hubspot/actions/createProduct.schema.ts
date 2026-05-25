import { z } from "zod";

/**
 * `create_product` action schema — Slice 13 Batch 2.
 *
 * Required: `name`. V1 enforces; V2 enforces at the schema layer.
 * Other product fields are typed-string per HubSpot's wire format
 * (server-side coercion handles numerics).
 */
export const CreateProductConfigSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    price: z.string().min(1).optional(),
    hs_sku: z.string().min(1).optional(),
    hs_cost_of_goods_sold: z.string().min(1).optional(),
    hs_recurring_billing_period: z.string().min(1).optional(),
  })
  .strict();

export type CreateProductConfig = z.infer<typeof CreateProductConfigSchema>;
