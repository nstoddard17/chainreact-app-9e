import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/checkout/sessions` API wrapper.
 *
 * Slice 11 baseline shipped `paymentIntents`, `customers`, `refunds`,
 * `subscriptions` — Checkout Sessions deferred to Stripe 2.1. This
 * module adds the create-only surface used by
 * `actions/createCheckoutSession.ts`.
 *
 * Wire-format: form-encoded POST through `stripeRequest`. Nested
 * fields (`line_items[].price`, `line_items[].quantity`,
 * `automatic_tax.enabled`, `metadata.<key>`) get bracket-notation
 * flattened via `flattenForStripe` inside `stripeRequest`. The wrapper
 * keeps the input shape natural object/array so handler code stays
 * readable; the wire conversion is transparent.
 *
 * V1 reference: `lib/workflows/actions/stripe/createCheckoutSession.ts`
 * (258 LOC). V2 sheds V1's raw `line_items` JSON passthrough, raw
 * `metadata` JSON passthrough, V1's auto-mode-detection price probe
 * (which issued an extra `GET /v1/prices/{id}` per call), V1's
 * `shipping_address_collection` raw passthrough, and V1's
 * `payment_method_types` / `billing_address_collection` / `locale`
 * options (deferred — no V2 schema yet). The remaining wire-format
 * mapping is identical.
 */

// ─── Wire-format response type ──────────────────────────────────────────────

/**
 * Stripe Checkout Session resource. Only the fields V2 surfaces on
 * the action output are pinned here — Stripe's response carries many
 * more (`amount_subtotal`, `consent_collection`, `custom_fields`,
 * `phone_number_collection`, `shipping_options`, etc.) but V2 keeps
 * the typed surface narrow per Slice 11 convention. Adding a field is
 * an additive change here + in the handler's output mapping.
 */
export interface StripeCheckoutSession {
  id: string;
  object: "checkout.session";
  mode: "payment" | "subscription" | "setup";
  url: string | null;
  status: string | null;
  payment_status: string | null;
  customer: string | null;
  customer_email: string | null;
  client_reference_id: string | null;
  payment_intent: string | null;
  subscription: string | null;
  amount_total: number | null;
  currency: string | null;
  expires_at: number | null;
  success_url: string | null;
  cancel_url: string | null;
  metadata: Record<string, string>;
  livemode: boolean;
}

// ─── checkoutSessionsCreate ─────────────────────────────────────────────────

export interface CheckoutSessionsCreateInput {
  accessToken: string;
  mode: "payment" | "subscription" | "setup";
  successUrl: string;
  cancelUrl: string;
  /**
   * Line items: `[{ price, quantity }]`. Required for `payment` /
   * `subscription` modes; MUST be omitted for `setup` mode (Stripe
   * rejects with HTTP 400 if supplied). Handler enforces the
   * conditional; this wrapper just passes through.
   */
  lineItems?: ReadonlyArray<{ price: string; quantity: number }>;
  customer?: string;
  customerEmail?: string;
  clientReferenceId?: string;
  metadata?: Record<string, string>;
  allowPromotionCodes?: boolean;
  /**
   * `automatic_tax.enabled`. When true, Stripe computes tax based on
   * the customer's address. Defaults to omitted (Stripe applies
   * `false`).
   */
  automaticTaxEnabled?: boolean;
  idempotencyKey?: string;
}

export async function checkoutSessionsCreate(
  input: CheckoutSessionsCreateInput,
): Promise<StripeCheckoutSession> {
  const body: Record<string, unknown> = {
    mode: input.mode,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };

  if (input.lineItems !== undefined && input.lineItems.length > 0) {
    body.line_items = input.lineItems.map((item) => ({
      price: item.price,
      quantity: item.quantity,
    }));
  }
  if (input.customer !== undefined) body.customer = input.customer;
  if (input.customerEmail !== undefined) body.customer_email = input.customerEmail;
  if (input.clientReferenceId !== undefined) {
    body.client_reference_id = input.clientReferenceId;
  }
  if (input.metadata !== undefined) body.metadata = input.metadata;
  if (input.allowPromotionCodes !== undefined) {
    body.allow_promotion_codes = input.allowPromotionCodes;
  }
  if (input.automaticTaxEnabled !== undefined) {
    body.automatic_tax = { enabled: input.automaticTaxEnabled };
  }

  return stripeRequest<StripeCheckoutSession>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/checkout/sessions",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "checkout_session (create)",
  });
}
