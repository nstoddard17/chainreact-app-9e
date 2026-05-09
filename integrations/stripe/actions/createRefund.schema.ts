import { z } from "zod";

/**
 * `create_refund` action schema.
 *
 * XOR — exactly one of `chargeId` or `paymentIntentId` is required.
 * V1 prefers `paymentIntentId` when both are supplied (silent
 * preference); V2 requires the user to choose, surfacing the
 * conflict at validation time (Q11 — no silent precedence rules).
 *
 * `amount` is in DOLLARS (user-facing). Handler converts to cents.
 * Optional — Stripe defaults to a full refund when amount is
 * omitted, which is the common case.
 *
 * `reason` is restricted to Stripe's enum (`duplicate`, `fraudulent`,
 * `requested_by_customer`); workflows that pass a free-text reason
 * should use the `metadata` field instead.
 */
export const CreateRefundConfigSchema = z
  .object({
    chargeId: z.string().min(1).optional(),
    paymentIntentId: z.string().min(1).optional(),
    /** Amount in DOLLARS — handler converts to cents. */
    amount: z
      .union([
        z.number().positive(),
        z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive number with up to 2 decimal places"),
      ])
      .optional(),
    reason: z
      .enum(["duplicate", "fraudulent", "requested_by_customer"])
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.chargeId) !== Boolean(v.paymentIntentId),
    {
      message: "Provide exactly one of chargeId or paymentIntentId.",
    },
  );

export type CreateRefundConfig = z.infer<typeof CreateRefundConfigSchema>;
