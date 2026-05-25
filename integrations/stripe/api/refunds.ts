import { stripeRequest } from "./_request";

/**
 * Stripe `/v1/refunds` API wrapper.
 *
 * One endpoint in Slice 11 Batch 1: create. Refund retrieval / list
 * deferred.
 */

export interface StripeRefund {
  id: string;
  object: "refund";
  amount: number;
  currency: string;
  status: string;
  charge: string | null;
  payment_intent: string | null;
  reason: string | null;
  receipt_number: string | null;
  created: number;
  metadata: Record<string, string>;
}

// ─── refundsCreate ──────────────────────────────────────────────────────────

export interface RefundsCreateInput {
  accessToken: string;
  /**
   * Stripe accepts either `charge` or `payment_intent` — handler
   * schema enforces XOR (exactly one required). Wrapper passes
   * whichever the caller supplies.
   */
  charge?: string;
  payment_intent?: string;
  /**
   * Amount in CENTS (callers convert from dollars via `dollarsToCents`).
   * Optional — Stripe defaults to a full refund when amount is
   * omitted.
   */
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export async function refundsCreate(
  input: RefundsCreateInput,
): Promise<StripeRefund> {
  const body: Record<string, unknown> = {};
  if (input.payment_intent !== undefined) body.payment_intent = input.payment_intent;
  if (input.charge !== undefined) body.charge = input.charge;
  if (input.amount !== undefined) body.amount = input.amount;
  if (input.reason !== undefined) body.reason = input.reason;
  if (input.metadata !== undefined) body.metadata = input.metadata;

  return stripeRequest<StripeRefund>({
    accessToken: input.accessToken,
    method: "POST",
    path: "/v1/refunds",
    body,
    idempotencyKey: input.idempotencyKey,
    resourceForNotFound: "refund (create)",
  });
}
