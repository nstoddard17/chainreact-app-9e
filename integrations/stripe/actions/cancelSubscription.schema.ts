import { z } from "zod";

/**
 * `cancel_subscription` action schema.
 *
 * `subscriptionId` is required.
 *
 * Three optional flags map to Stripe's query-string parameters on
 * the cancel endpoint:
 *   - `at_period_end` (V2 schema field) → Stripe's
 *     `cancel_at_period_end` query param. When true, the
 *     subscription continues until the end of the current period
 *     and then cancels (vs immediate).
 *   - `invoice_now` → emit a final invoice for any unbilled time.
 *   - `prorate` → calculate prorated charges/credits at the time
 *     of cancellation.
 *
 * V1 uses these field names verbatim (`cancelSubscription.ts:62-78`);
 * V2 mirrors so workflow authors who copy V1 configs continue to
 * work.
 */
export const CancelSubscriptionConfigSchema = z
  .object({
    subscriptionId: z.string().min(1),
    at_period_end: z.boolean().optional(),
    invoice_now: z.boolean().optional(),
    prorate: z.boolean().optional(),
  })
  .strict();

export type CancelSubscriptionConfig = z.infer<
  typeof CancelSubscriptionConfigSchema
>;
