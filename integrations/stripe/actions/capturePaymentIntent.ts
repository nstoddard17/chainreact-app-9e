import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { paymentIntentsCapture } from "../api/paymentIntents";
import { CapturePaymentIntentConfigSchema } from "./capturePaymentIntent.schema";

/**
 * Stripe `capture_payment_intent` action handler.
 *
 * POSTs `/v1/payment_intents/{id}/capture`. No `Idempotency-Key` —
 * capture is server-side idempotent (resource id deduplicates;
 * calling capture twice on a `succeeded` intent yields the same
 * final state).
 *
 * `amount_to_capture` is in CENTS (V1 quirk — see schema JSDoc).
 */
export const capturePaymentIntent: ActionHandler = async (input) => {
  const config = CapturePaymentIntentConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    apiCall: (accessToken) =>
      paymentIntentsCapture({
        accessToken,
        paymentIntentId: config.paymentIntentId,
        amount_to_capture: config.amount_to_capture,
      }),
  });

  return {
    output: {
      paymentIntentId: result.id,
      status: result.status,
      amount: result.amount,
      amountCaptured: result.amount_received ?? null,
      currency: result.currency,
    },
  };
};
