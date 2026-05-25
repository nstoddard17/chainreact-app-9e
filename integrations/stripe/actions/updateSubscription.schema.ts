import { z } from "zod";

/**
 * `update_subscription` action schema.
 *
 * `subscriptionId` is required; every other field optional (Stripe
 * supports partial updates).
 *
 * `priceId` + `quantity` go into the `items: [{id, price?, quantity?}]`
 * array — handler pre-fetches the subscription to extract the
 * subscription_item id (`si_xxx`).
 *
 * `trial_end` accepts either a Unix timestamp (seconds) or the literal
 * string `"now"` (Stripe's documented value for "end the trial
 * immediately"). Schema validates the union at design time.
 */
export const UpdateSubscriptionConfigSchema = z
  .object({
    subscriptionId: z.string().min(1),
    priceId: z.string().min(1).optional(),
    quantity: z.number().int().positive().optional(),
    trial_end: z
      .union([z.number().int().positive(), z.literal("now")])
      .optional(),
    cancel_at_period_end: z.boolean().optional(),
    proration_behavior: z
      .enum(["create_prorations", "none", "always_invoice"])
      .optional(),
    default_payment_method: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    collection_method: z
      .enum(["charge_automatically", "send_invoice"])
      .optional(),
    days_until_due: z.number().int().positive().optional(),
  })
  .strict();

export type UpdateSubscriptionConfig = z.infer<
  typeof UpdateSubscriptionConfigSchema
>;
