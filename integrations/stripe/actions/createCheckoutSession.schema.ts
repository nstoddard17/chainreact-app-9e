import { z } from "zod";

/**
 * `create_checkout_session` action schema.
 *
 * Stripe 2.1 Commit 1 — first net-new Stripe action after Slice 11.
 *
 * Required fields (Q11):
 *   - `mode`: `"payment" | "subscription" | "setup"`. No
 *     auto-detection (V1 issued an extra `GET /v1/prices/{id}` to
 *     guess; V2 makes the workflow author pick, and Stripe enforces
 *     the price-type ↔ mode match server-side).
 *   - `successUrl` / `cancelUrl`: customer redirect targets after
 *     Stripe Checkout completes / is abandoned. Both required by
 *     Stripe even for `setup` mode (per docs).
 *   - `lineItems`: `[{ priceId, quantity }]` — required for `payment`
 *     / `subscription` modes; **rejected** for `setup` mode (Stripe
 *     400s if supplied with `mode: "setup"`, so V2 fails closed at
 *     parse time). Min 1, max 99 (Stripe's documented per-session
 *     line-items cap is 99 for guest sessions; existing-customer
 *     sessions allow more but 99 is a conservative cap).
 *
 * Optional safe fields:
 *   - `customer` (Stripe customer id) OR `customerEmail`. Not both
 *     (Stripe accepts both at runtime but the combo is ambiguous —
 *     if `customer` is set, `customerEmail` is ignored). V2 rejects
 *     the combination at schema time.
 *   - `clientReferenceId`: workflow-defined string echoed back on
 *     `checkout.session.completed` webhook for downstream
 *     workflow → external-system correlation.
 *   - `metadata`: `Record<string, string>` per Stripe's wire-format.
 *     No nested-JSON passthrough (V1 had it via `JSON.parse`; V2
 *     rejects).
 *   - `allowPromotionCodes`: boolean. Defaults to omitted (Stripe
 *     applies `false`).
 *   - `automaticTax.enabled`: boolean. Defaults to omitted (Stripe
 *     applies `false`). Customer-address-based tax calculation.
 *
 * Deferred (V1 supports, V2 Stripe 2.1 Commit 1 omits — additive
 * change later if a workflow needs them):
 *   `payment_method_types`, `billing_address_collection`,
 *   `shipping_address_collection` / `shipping_countries`, `locale`,
 *   `subscription_data`, `payment_intent_data`, `tax_id_collection`,
 *   `consent_collection`, `phone_number_collection`,
 *   `custom_fields`, `custom_text`, `shipping_options`.
 *
 * V1 patterns deliberately NOT ported (NPD-S1 + audit §8):
 *   - Raw `line_items` JSON passthrough (V1 accepted a JSON string
 *     of line_items objects). V2 rejects unknown fields and requires
 *     typed `[{priceId, quantity}]`.
 *   - Raw `metadata` JSON-string passthrough. V2 requires typed
 *     `Record<string, string>`.
 *   - Auto-mode-detection price probe (`GET /v1/prices/{firstPriceId}`
 *     before each create). V2 trusts the workflow author + Stripe's
 *     wire-format validation.
 *   - Hidden currency defaults / quantity coercion (V1 used
 *     `parseInt(quantity) || 1`). V2 requires explicit `quantity`
 *     per line item.
 */
export const CreateCheckoutSessionConfigSchema = z
  .object({
    mode: z.enum(["payment", "subscription", "setup"]),
    successUrl: z.string().url("successUrl must be an absolute URL"),
    cancelUrl: z.string().url("cancelUrl must be an absolute URL"),
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
      .max(99, "lineItems cannot exceed 99 entries")
      .optional(),
    customer: z.string().min(1).optional(),
    customerEmail: z.string().email().optional(),
    clientReferenceId: z.string().min(1).max(200).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    allowPromotionCodes: z.boolean().optional(),
    automaticTax: z
      .object({
        enabled: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Mode ↔ lineItems conditional. Mirrors Stripe's runtime validation
    // but surfaces the error at design time rather than after a Stripe
    // 400 round-trip.
    if (value.mode === "setup") {
      if (value.lineItems !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lineItems"],
          message:
            "lineItems must be omitted when mode='setup' (Stripe setup sessions don't accept line_items)",
        });
      }
    } else if (value.lineItems === undefined || value.lineItems.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lineItems"],
        message: `lineItems is required when mode='${value.mode}'`,
      });
    }
    // Disallow customer + customerEmail combination — ambiguous.
    if (value.customer !== undefined && value.customerEmail !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerEmail"],
        message:
          "customerEmail must be omitted when customer is supplied (the existing customer's email is used)",
      });
    }
  });

export type CreateCheckoutSessionConfig = z.infer<
  typeof CreateCheckoutSessionConfigSchema
>;
