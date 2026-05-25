import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/payment_links` API wrapper.
 *
 * Stripe 2.1 Commit 2 — wrapper for the `create_payment_link` action.
 * Payment Links are shareable URLs that host a Stripe-hosted payment
 * page; lighter-weight than full Checkout Sessions (no per-customer
 * success/cancel URLs required, link is reusable).
 *
 * Wire-format: form-encoded POST through `stripeRequest`. Nested
 * fields (`line_items[].price`, `line_items[].quantity`,
 * `after_completion.type`, `after_completion.redirect.url`,
 * `metadata.<key>`) get bracket-notation flattened via
 * `flattenForStripe` inside `stripeRequest`.
 *
 * V1 reference: `lib/workflows/actions/stripe/createPaymentLink.ts`
 * (165 LOC). V2 sheds V1's raw `line_items` JSON-string passthrough,
 * raw `metadata` JSON-string passthrough, raw `after_completion`
 * JSON-string passthrough, V1's `shipping_address_collection` /
 * `shipping_countries` raw passthrough, and V1's
 * `application_fee_amount` / `application_fee_percent` (deferred —
 * no V2 Stripe Connect platform-fee convention yet). V1 does NOT
 * support `automatic_tax` for payment_links; V2 does NOT add it
 * (Slice 11 / parity-stripe `if V1 supports` gate). The remaining
 * wire-format mapping is identical to V1.
 *
 * V1 also did NOT send an `Idempotency-Key` header for payment_links.
 * V2 adds it per Slice 11 convention — the same `${runId}:${nodeId}:
 * stripe_action_create_payment_link` shape every Stripe action uses
 * (Q4 contract).
 */

// ─── Wire-format response type ──────────────────────────────────────────────

/**
 * Stripe Payment Link resource. Only the fields V2 surfaces on the
 * action output are pinned. Stripe's response carries many more
 * (`after_completion`, `allow_promotion_codes`, `automatic_tax`,
 * `billing_address_collection`, `custom_fields`, `custom_text`,
 * `inactive_message`, `payment_intent_data`, `payment_method_types`,
 * `phone_number_collection`, `submit_type`, `subscription_data`,
 * `tax_id_collection`, `transfer_data`) — adding a field is an
 * additive change here + in the handler's output mapping. Stripe
 * does NOT inline `line_items` on the create response without
 * `expand: ["line_items"]`; V2 doesn't request expansion so the
 * field is omitted from the typed shape entirely.
 */
export interface StripePaymentLink {
  id: string;
  object: "payment_link";
  active: boolean;
  url: string;
  currency: string;
  metadata: Record<string, string>;
  livemode: boolean;
}

// ─── paymentLinksCreate ─────────────────────────────────────────────────────

export interface PaymentLinksCreateInput {
  accessToken: string;
  /**
   * Line items: `[{ price, quantity }]`. Stripe's payment_links cap
   * is 20 items per link (caller-enforced in the schema; this wrapper
   * just passes through).
   */
  lineItems: ReadonlyArray<{ price: string; quantity: number }>;
  metadata?: Record<string, string>;
  allowPromotionCodes?: boolean;
  /**
   * Post-completion behavior. Discriminated by `type`:
   *   - `redirect` — Stripe redirects to `redirectUrl` after payment.
   *   - `hosted_confirmation` — Stripe shows its own confirmation
   *     page.
   * Defaults to omitted (Stripe applies `hosted_confirmation`).
   */
  afterCompletion?:
    | { type: "redirect"; redirectUrl: string }
    | { type: "hosted_confirmation" };
  idempotencyKey?: string;
}

export async function paymentLinksCreate(
  input: PaymentLinksCreateInput,
): Promise<StripePaymentLink> {
  const body: Record<string, unknown> = {
    line_items: input.lineItems.map((item) => ({
      price: item.price,
      quantity: item.quantity,
    })),
  };

  if (input.metadata !== undefined) body.metadata = input.metadata;
  if (input.allowPromotionCodes !== undefined) {
    body.allow_promotion_codes = input.allowPromotionCodes;
  }
  if (input.afterCompletion !== undefined) {
    if (input.afterCompletion.type === "redirect") {
      body.after_completion = {
        type: "redirect",
        redirect: { url: input.afterCompletion.redirectUrl },
      };
    } else {
      body.after_completion = { type: "hosted_confirmation" };
    }
  }

  return stripeRequest<StripePaymentLink>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/payment_links",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "payment_link (create)",
  });
}
