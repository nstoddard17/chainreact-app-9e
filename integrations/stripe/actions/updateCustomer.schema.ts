import { z } from "zod";

/**
 * `update_customer` action schema.
 *
 * `customerId` is required; every other field optional (Stripe
 * supports partial updates — only the fields the user supplies get
 * patched).
 */
export const UpdateCustomerConfigSchema = z
  .object({
    customerId: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type UpdateCustomerConfig = z.infer<typeof UpdateCustomerConfigSchema>;
