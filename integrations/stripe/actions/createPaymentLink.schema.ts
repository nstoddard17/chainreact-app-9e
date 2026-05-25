import { z } from "zod";

/**
 * `create_payment_link` action schema.
 *
 * Stripe 2.1 Commit 2 — Payment Link creation. Payment Links are
 * shareable, reusable URLs that host a Stripe-hosted payment page.
 *
 * Required fields (Q11):
 *   - `lineItems`: `[{ priceId, quantity }]`. Min 1, max 20 (Stripe's
 *     documented per-payment-link cap). Stripe rejects payment_links
 *     with no line_items at runtime; V2 fails closed at parse time.
 *
 * Optional safe fields:
 *   - `metadata`: `Record<string, string>` per Stripe's wire-format.
 *     No nested-JSON passthrough (V1 had it via `JSON.parse`; V2
 *     rejects).
 *   - `allowPromotionCodes`: boolean. Defaults to omitted (Stripe
 *     applies `false`).
 *   - `afterCompletion`: discriminated union for post-payment
 *     behavior. Two variants:
 *       * `{ type: "redirect", redirectUrl: <URL> }` — Stripe
 *         redirects the customer to `redirectUrl` after payment.
 *       * `{ type: "hosted_confirmation" }` — Stripe shows its own
 *         confirmation page (Stripe default when omitted).
 *
 * Deferred (V1 supports, V2 Stripe 2.1 Commit 2 omits — additive
 * change later if a workflow needs them):
 *   - `applicationFeeAmount` / `applicationFeePercent` — Stripe
 *     Connect platform-fee fields. V1 supports both but V2's Stripe
 *     Connect surface has no convention for platform fees yet
 *     (Slice 11 didn't ship them on any of its 10 actions). Adding
 *     them is a follow-up batch decision, not a Stripe 2.1 Commit 2
 *     concern.
 *   - `shippingAddressCollection` / `shippingCountries` — same
 *     deferral as `create_checkout_session`. No clean V2 typed
 *     shape yet.
 *   - `paymentMethodTypes`, `billingAddressCollection`, `submitType`,
 *     `customFields`, `customText`, `phoneNumberCollection`,
 *     `taxIdCollection`, `subscriptionData`, `paymentIntentData`,
 *     `inactiveMessage`, `restrictions` — additive future batches.
 *
 * NOT supported (V1 doesn't, V2 inherits the gap):
 *   - `automaticTax.enabled` — V1's `createPaymentLink.ts` does NOT
 *     send `automatic_tax`. Per parity-stripe §"if V1 supports" gate,
 *     V2 also omits. The shipped `create_checkout_session` (Commit 1)
 *     DOES support automatic_tax because V1's checkout-session
 *     handler does — provider parity is per-action.
 *
 * V1 patterns deliberately NOT ported (parity-stripe §8 R-Stripe-2):
 *   - Raw `line_items` JSON-string passthrough.
 *   - Raw `metadata` JSON-string passthrough.
 *   - Raw `after_completion` JSON-string passthrough.
 *   - Hidden `parseInt(quantity) || 1` coercion — V2 requires
 *     explicit positive integer per line item.
 *   - V1's `application_fee_amount` `parseInt(feeAmount.toString())`
 *     silent coercion — defer until V2 has a typed Stripe Connect
 *     platform-fee convention.
 */
export const CreatePaymentLinkConfigSchema = z
  .object({
    lineItems: z
      .array(
        z
          .object({
            priceId: z
              .string()
              .min(1, "priceId is required for every line item"),
            quantity: z
              .number()
              .int("quantity must be an integer")
              .positive("quantity must be a positive integer"),
          })
          .strict(),
      )
      .min(1, "lineItems must contain at least 1 item")
      .max(20, "Stripe payment_links accepts at most 20 line items"),
    metadata: z.record(z.string(), z.string()).optional(),
    allowPromotionCodes: z.boolean().optional(),
    afterCompletion: z
      .discriminatedUnion("type", [
        z
          .object({
            type: z.literal("redirect"),
            redirectUrl: z
              .string()
              .url("redirectUrl must be an absolute URL"),
          })
          .strict(),
        z
          .object({
            type: z.literal("hosted_confirmation"),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();

export type CreatePaymentLinkConfig = z.infer<
  typeof CreatePaymentLinkConfigSchema
>;
