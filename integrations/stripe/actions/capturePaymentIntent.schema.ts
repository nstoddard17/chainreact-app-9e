import { z } from "zod";

/**
 * `capture_payment_intent` action schema.
 *
 * Q11 — `paymentIntentId` is required.
 *
 * **`amount_to_capture` is in CENTS** (Stripe wire-format passthrough,
 * V1 quirk preserved). Unlike `create_payment_intent.amount` which
 * accepts dollars and converts, this field is forwarded verbatim to
 * Stripe.
 *
 * Workflow authors who pass dollars will capture 1% of the intended
 * amount. The schema's `description` (in JSDoc above the field)
 * documents this loudly. Future V2 may normalize all amounts to
 * cents at the schema layer; Slice 11 mirrors V1 to keep the port
 * mechanical.
 *
 * If amount_to_capture is omitted, Stripe captures the full
 * authorized amount (most common case).
 */
export const CapturePaymentIntentConfigSchema = z
  .object({
    paymentIntentId: z.string().min(1),
    /**
     * Amount in CENTS (Stripe wire-format). To capture $20.99, pass
     * 2099. Workflow authors who want dollars-semantics should
     * compute the cents value upstream.
     */
    amount_to_capture: z.number().int().positive().optional(),
  })
  .strict();

export type CapturePaymentIntentConfig = z.infer<
  typeof CapturePaymentIntentConfigSchema
>;
