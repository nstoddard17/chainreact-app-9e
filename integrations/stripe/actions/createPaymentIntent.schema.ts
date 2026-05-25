import { z } from "zod";

/**
 * `create_payment_intent` action schema.
 *
 * Q11 — `amount` and `currency` are required.
 *
 * `amount` is in DOLLARS (user-facing). Handler converts to cents via
 * `dollarsToCents`. This is V1's behavior (preserved for cutover
 * parity) — see V1 `createPaymentIntent.ts:74`.
 *
 * `currency` is lowercase ISO-4217 (Stripe rejects uppercase). The
 * schema enforces lowercase via regex.
 *
 * Slice 11 deferred (V1 supports but V2 Batch 1 omits): `payment_method`,
 * `payment_method_types`, `automatic_payment_methods`, `confirm`,
 * `capture_method`, `off_session`, `setup_future_usage`,
 * `statement_descriptor`. Adding any of these requires no schema
 * migration — just a future-batch additive change.
 */
export const CreatePaymentIntentConfigSchema = z
  .object({
    /** Amount in DOLLARS — handler converts to cents. */
    amount: z.union([
      z.number().positive(),
      z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive number with up to 2 decimal places"),
    ]),
    /** Lowercase ISO-4217 currency code (e.g. "usd", "eur"). */
    currency: z.string().regex(/^[a-z]{3}$/, "currency must be a 3-letter lowercase ISO code"),
    customerId: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export type CreatePaymentIntentConfig = z.infer<
  typeof CreatePaymentIntentConfigSchema
>;
