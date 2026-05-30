import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { chargesList } from "../api/charges";
import { GetPaymentsConfigSchema } from "./getPayments.schema";

/**
 * Stripe `get_payments` action handler — Stripe 2.1 Commit 4.
 *
 * GETs `/v1/charges` with the connected merchant's access token.
 * Read-only — no Idempotency-Key (Stripe rejects the header on GET
 * requests anyway).
 *
 * Single-page only — workflow authors compose a downstream loop on
 * `output.nextCursor` (the id of the last charge in this page when
 * `output.hasMore: true`, else `null`).
 *
 * `accountId` resolution: when the workflow's trigger is a Stripe
 * webhook event, `triggerEvent.providerAccountId` carries the connected
 * merchant's `stripe_user_id`. For manual / cross-provider triggers,
 * `accountId` is null and `refreshAndRetry`'s integration lookup
 * picks the user's single Stripe integration row.
 *
 * Output shape:
 *   - `payments: BoundedCharge[]` — each charge projected to the
 *     locked 13-key shape:
 *       { chargeId, amount, currency, status, paid, refunded,
 *         customerId, paymentIntentId, created, description,
 *         receiptUrl, metadata, livemode }
 *     Stripe's raw response includes ~30 fields per charge; V2
 *     surfaces only the workflow-relevant subset. Adding a field is
 *     additive here + in `StripeCharge` interface.
 *   - `count: number` — `payments.length`.
 *   - `hasMore: boolean` — Stripe's `has_more` echo.
 *   - `nextCursor: string | null` — the last charge's id when
 *     `hasMore: true`, else null. Workflows pass this back as
 *     `startingAfter` on the next iteration.
 *
 *   No raw Stripe response spread — every key in `payments[i]` is
 *   an explicit projection.
 */
export const getPayments: ActionHandler = async (input) => {
  const config = GetPaymentsConfigSchema.parse(input.config);

  const providerAccountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.providerAccountId
      : null;

  const result = await refreshAndRetry({
    accountId: input.accountId,
    provider: "stripe",
    providerAccountId,
    preflight: stripeLivemodePreflight({
      actionType: "get_payments",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      chargesList({
        accessToken,
        customer: config.customer,
        limit: config.limit,
        startingAfter: config.startingAfter,
        endingBefore: config.endingBefore,
      }),
  });

  const payments = result.data.map((charge) => ({
    chargeId: charge.id,
    amount: charge.amount,
    currency: charge.currency,
    status: charge.status,
    paid: charge.paid,
    refunded: charge.refunded,
    customerId: charge.customer,
    paymentIntentId: charge.payment_intent,
    created: charge.created,
    description: charge.description,
    receiptUrl: charge.receipt_url,
    metadata: charge.metadata,
    livemode: charge.livemode,
  }));

  // Stripe's list convention: nextCursor = last item's id when
  // has_more is true. Null when no more pages OR when the result
  // set is empty.
  const nextCursor =
    result.has_more && payments.length > 0
      ? payments[payments.length - 1]!.chargeId
      : null;

  return {
    output: {
      payments,
      count: payments.length,
      hasMore: result.has_more,
      nextCursor,
    },
  };
};
