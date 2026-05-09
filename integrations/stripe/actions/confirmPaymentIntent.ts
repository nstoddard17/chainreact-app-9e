import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { paymentIntentsConfirm } from "../api/paymentIntents";
import { ConfirmPaymentIntentConfigSchema } from "./confirmPaymentIntent.schema";

/**
 * Stripe `confirm_payment_intent` action handler.
 *
 * POSTs `/v1/payment_intents/{id}/confirm`. No `Idempotency-Key` —
 * confirm is server-side idempotent (the resource id is the
 * deduplicating key); calling confirm twice on a `succeeded` intent
 * yields the same final state. (Q4 idempotency-keyed actions are
 * limited to creates per the Slice 11 plan §17.)
 */
export const confirmPaymentIntent: ActionHandler = async (input) => {
  const config = ConfirmPaymentIntentConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    apiCall: (accessToken) =>
      paymentIntentsConfirm({
        accessToken,
        paymentIntentId: config.paymentIntentId,
        payment_method: config.payment_method,
        receipt_email: config.receipt_email,
        return_url: config.return_url,
      }),
  });

  return {
    output: {
      paymentIntentId: result.id,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      clientSecret: result.client_secret,
      nextAction: result.next_action,
    },
  };
};
