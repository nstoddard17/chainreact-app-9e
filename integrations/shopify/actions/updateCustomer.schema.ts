import { z } from "zod";

/**
 * `update_customer` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/updateCustomer.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateCustomer.ts).
 *
 * All update fields optional — Shopify's PUT accepts a partial
 * customer body. No Q11 gate (update doesn't trigger emails).
 *
 * `accepts_marketing` is a boolean here (V1's "Keep Current" /
 * "Yes" / "No" select-shape is dropped — Slice 12 expresses
 * "no change" by omitting the field entirely).
 */
export const UpdateCustomerConfigSchema = z
  .object({
    customer_id: z.union([z.string().min(1), z.number().int().positive()]),
    email: z.string().email().optional(),
    first_name: z.string().min(1).optional(),
    last_name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    tags: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
    accepts_marketing: z.boolean().optional(),
  })
  .strict();

export type UpdateCustomerConfig = z.infer<typeof UpdateCustomerConfigSchema>;
