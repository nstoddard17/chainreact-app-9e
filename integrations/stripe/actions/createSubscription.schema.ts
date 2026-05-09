import { z } from "zod";

/**
 * `create_subscription` action schema.
 *
 * Single-price subscription (Slice 11 Batch 1). Multi-item
 * subscriptions deferred — would require an `items: [{ priceId,
 * quantity? }]` shape and is rare in workflow-driven flows.
 *
 * Q11 — `customerId` and `priceId` required.
 *
 * `payment_behavior` is restricted to Stripe's documented enum;
 * `default_incomplete` is the recommended value for SaaS-style
 * subscriptions where the workflow author wants to redirect the
 * customer to confirm payment, but Slice 11 doesn't default — Q11
 * explicit-fields contract.
 */
export const CreateSubscriptionConfigSchema = z
  .object({
    customerId: z.string().min(1),
    priceId: z.string().min(1),
    default_payment_method: z.string().min(1).optional(),
    payment_behavior: z
      .enum([
        "allow_incomplete",
        "default_incomplete",
        "error_if_incomplete",
        "pending_if_incomplete",
      ])
      .optional(),
    trialPeriodDays: z.number().int().positive().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type CreateSubscriptionConfig = z.infer<
  typeof CreateSubscriptionConfigSchema
>;
