import { z } from "zod";

/**
 * `confirm_payment_intent` action schema.
 *
 * `paymentIntentId` is required. Other fields are pass-through
 * options Stripe accepts on the confirm endpoint.
 */
export const ConfirmPaymentIntentConfigSchema = z
  .object({
    paymentIntentId: z.string().min(1),
    payment_method: z.string().min(1).optional(),
    receipt_email: z.string().email().optional(),
    return_url: z.string().url().optional(),
  })
  .strict();

export type ConfirmPaymentIntentConfig = z.infer<
  typeof ConfirmPaymentIntentConfigSchema
>;
