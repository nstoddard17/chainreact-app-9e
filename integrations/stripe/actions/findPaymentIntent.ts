import type { ActionHandler } from "@/services/execution/handlers/types";
import {
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import {
  paymentIntentsGet,
  type StripePaymentIntent,
} from "../api/paymentIntents";
import { FindPaymentIntentConfigSchema } from "./findPaymentIntent.schema";

/**
 * Stripe `find_payment_intent` action handler — Stripe 2.1 Commit 5.
 *
 * Direct id lookup via `GET /v1/payment_intents/{paymentIntentId}`.
 * Read-only — no Idempotency-Key (Stripe rejects the header on GET).
 *
 * 404 → `{ found: false, paymentIntent: null }` (NOT thrown). Mirrors
 * `find_customer` / `find_subscription`'s catch-NotFoundError pattern.
 *
 * Output shape (bounded 12-key projection):
 *   { found: boolean,
 *     paymentIntent: {
 *       paymentIntentId, amount, amountReceived, currency, status,
 *       customerId, latestChargeId, paymentMethodId,
 *       description, receiptEmail, metadata, livemode,
 *     } | null }
 *
 *   No raw Stripe response spread — every key is an explicit projection.
 *   Nullable Stripe fields (customer / latest_charge / payment_method /
 *   description / receipt_email) preserve their null values.
 *
 *   `amountReceived` falls back to 0 only when Stripe's response omits
 *   the field entirely (older API versions); when present, the value is
 *   passed through unchanged (including 0 for unconfirmed intents).
 */
export const findPaymentIntent: ActionHandler = async (input) => {
  const config = FindPaymentIntentConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  try {
    const result = await refreshAndRetry({
      userId: input.userId,
      provider: "stripe",
      accountId,
      apiCall: (accessToken) =>
        paymentIntentsGet({
          accessToken,
          paymentIntentId: config.paymentIntentId,
        }),
    });
    return {
      output: { found: true, paymentIntent: paymentIntentOutput(result) },
    };
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { output: { found: false, paymentIntent: null } };
    }
    if (err instanceof Unauthorized401Error) throw err;
    throw err;
  }
};

function paymentIntentOutput(
  p: StripePaymentIntent,
): Record<string, unknown> {
  return {
    paymentIntentId: p.id,
    amount: p.amount,
    amountReceived: p.amount_received ?? null,
    currency: p.currency,
    status: p.status,
    customerId: p.customer,
    latestChargeId: p.latest_charge,
    paymentMethodId: p.payment_method,
    description: p.description,
    receiptEmail: p.receipt_email,
    metadata: p.metadata,
    livemode: p.livemode,
  };
}
