import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/payment_methods` API wrapper — RESOLVERS-2.
 *
 * Read-only. Added to back the `stripe:payment_methods` option-source
 * family (the `default_payment_method` / `payment_method` pickers on
 * create_subscription / update_subscription / confirm_payment_intent).
 * No handler mutates payment methods — attach / detach / update stay
 * out of V2's action surface, so this file is list-only.
 *
 * Endpoint: `GET /v1/payment_methods?customer=cus_xxx`
 * (https://docs.stripe.com/api/payment_methods/list). On the pinned
 * `2025-05-28.basil` version `type` is OPTIONAL — omitting it returns
 * every payment-method type attached to the customer (card, bank
 * account, SEPA, Link, wallets), which is what a picker wants. Passing
 * `type=card` would silently hide a customer's ACH/SEPA mandates.
 *
 * Single page only (Stripe caps list pages at 100) — `has_more` is
 * surfaced to the resolver verbatim so the picker's "refine your
 * search" hint stays honest. No auto-pagination (rule 9).
 *
 * PAN SAFETY: the pinned response type below deliberately carries only
 * `brand` / `last4` / `exp_month` / `exp_year` off the card object.
 * Stripe never returns a full PAN on this endpoint, and this type keeps
 * it that way structurally — `billing_details` (name / email / phone /
 * address) is NOT pinned either, so no customer contact PII can reach
 * an option label by accident.
 */

// ─── Wire-format response types ─────────────────────────────────────────────

/** Card details Stripe returns on a `type: "card"` payment method. */
export interface StripePaymentMethodCard {
  /** e.g. "visa", "mastercard", "amex". Lowercase on the wire. */
  brand: string;
  /** LAST FOUR DIGITS ONLY — Stripe never returns a full PAN here. */
  last4: string;
  exp_month: number;
  exp_year: number;
}

/** US bank account details on a `type: "us_bank_account"` payment method. */
export interface StripePaymentMethodUsBankAccount {
  bank_name: string | null;
  last4: string | null;
}

/** Generic `last4`-bearing shape shared by SEPA / BACS / AU-BECS debits. */
export interface StripePaymentMethodDebit {
  last4: string | null;
}

/**
 * Stripe PaymentMethod resource, pinned to the fields the option
 * resolvers project into a human label. Stripe returns many more
 * (`billing_details`, `customer`, `metadata`, `livemode`, the full
 * per-type detail objects) — intentionally NOT pinned; see the PAN /
 * PII note in the file header.
 */
export interface StripePaymentMethod {
  id: string;
  object: "payment_method";
  /** Stripe's payment-method type discriminator, e.g. "card", "link". */
  type: string;
  created: number;
  card?: StripePaymentMethodCard;
  us_bank_account?: StripePaymentMethodUsBankAccount;
  sepa_debit?: StripePaymentMethodDebit;
  bacs_debit?: StripePaymentMethodDebit;
  au_becs_debit?: StripePaymentMethodDebit;
}

export interface StripePaymentMethodListResponse {
  object: "list";
  data: StripePaymentMethod[];
  has_more: boolean;
}

// ─── paymentMethodsList ─────────────────────────────────────────────────────

export interface PaymentMethodsListInput {
  accessToken: string;
  /** Required — Stripe scopes this listing to a single customer. */
  customer: string;
  /**
   * Optional Stripe payment-method type filter. Omit to list EVERY
   * type attached to the customer (the picker default).
   */
  type?: string;
  /** Stripe caps list pages at 100. */
  limit?: number;
}

export async function paymentMethodsList(
  input: PaymentMethodsListInput,
): Promise<StripePaymentMethodListResponse> {
  const query = new URLSearchParams();
  query.set("customer", input.customer);
  if (input.type !== undefined) query.set("type", input.type);
  if (input.limit !== undefined) query.set("limit", String(input.limit));

  return stripeRequest<StripePaymentMethodListResponse>({
    accessToken: input.accessToken,
    method: "GET",
    path: "/v1/payment_methods",
    query,
    resourceForNotFound: "payment_methods (list)",
  });
}
