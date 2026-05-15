import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/payment_intents` API wrappers.
 *
 * Three endpoints in Slice 11 Batch 1: create, confirm, capture.
 * Search / find / cancel deferred. PaymentIntent is the primary
 * payment surface in Stripe's modern API — replaces the older
 * Charges API for new integrations.
 */

// ─── Wire-format response types ─────────────────────────────────────────────

export interface StripePaymentIntent {
  id: string;
  object: "payment_intent";
  amount: number;
  amount_capturable?: number;
  amount_received?: number;
  currency: string;
  status: string;
  customer: string | null;
  description: string | null;
  client_secret: string | null;
  created: number;
  metadata: Record<string, string>;
  next_action: Record<string, unknown> | null;
  latest_charge: string | null;
  payment_method: string | null;
  payment_method_types: string[];
  receipt_email: string | null;
  livemode: boolean;
}

// ─── paymentIntentsCreate ───────────────────────────────────────────────────

export interface PaymentIntentsCreateInput {
  accessToken: string;
  /** Amount in CENTS (callers convert from dollars via `dollarsToCents`). */
  amount: number;
  /** Lowercase ISO-4217 currency code, e.g. "usd". */
  currency: string;
  customer?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export async function paymentIntentsCreate(
  input: PaymentIntentsCreateInput,
): Promise<StripePaymentIntent> {
  const body: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency,
  };
  if (input.customer !== undefined) body.customer = input.customer;
  if (input.description !== undefined) body.description = input.description;
  if (input.metadata !== undefined) body.metadata = input.metadata;

  return stripeRequest<StripePaymentIntent>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/payment_intents",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "payment_intent (create)",
  });
}

// ─── paymentIntentsGet ──────────────────────────────────────────────────────

export interface PaymentIntentsGetInput {
  accessToken: string;
  paymentIntentId: string;
}

export async function paymentIntentsGet(
  input: PaymentIntentsGetInput,
): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>({
    accessToken: input.accessToken,
    method: "GET",
    path: `/v1/payment_intents/${encodeURIComponent(input.paymentIntentId)}`,
    resourceForNotFound: `payment_intent ${input.paymentIntentId}`,
  });
}

// ─── paymentIntentsConfirm ──────────────────────────────────────────────────

export interface PaymentIntentsConfirmInput {
  accessToken: string;
  paymentIntentId: string;
  payment_method?: string;
  receipt_email?: string;
  return_url?: string;
}

export async function paymentIntentsConfirm(
  input: PaymentIntentsConfirmInput,
): Promise<StripePaymentIntent> {
  const body: Record<string, unknown> = {};
  if (input.payment_method !== undefined) body.payment_method = input.payment_method;
  if (input.receipt_email !== undefined) body.receipt_email = input.receipt_email;
  if (input.return_url !== undefined) body.return_url = input.return_url;

  return stripeRequest<StripePaymentIntent>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v1/payment_intents/${encodeURIComponent(input.paymentIntentId)}/confirm`,
    body,
    resourceForNotFound: `payment_intent ${input.paymentIntentId}`,
  });
}

// ─── paymentIntentsCapture ──────────────────────────────────────────────────

export interface PaymentIntentsCaptureInput {
  accessToken: string;
  paymentIntentId: string;
  /**
   * Amount in CENTS (Stripe wire-format passthrough — V1 quirk
   * preserved). Unlike `paymentIntentsCreate.amount` which is also
   * cents but converted from a dollars schema, this takes cents
   * directly because V1's `capture_payment_intent` schema documents
   * the cents semantics explicitly.
   */
  amount_to_capture?: number;
}

export async function paymentIntentsCapture(
  input: PaymentIntentsCaptureInput,
): Promise<StripePaymentIntent> {
  const body: Record<string, unknown> = {};
  if (input.amount_to_capture !== undefined) {
    body.amount_to_capture = input.amount_to_capture;
  }

  return stripeRequest<StripePaymentIntent>({
    accessToken: input.accessToken,
    method: "POST",
    path: `/v1/payment_intents/${encodeURIComponent(input.paymentIntentId)}/capture`,
    body,
    resourceForNotFound: `payment_intent ${input.paymentIntentId}`,
  });
}
