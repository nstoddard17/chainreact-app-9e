import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { buildIdempotencyKey } from "@/core/workflows/idempotency";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { customersCreate } from "../api/customers";
import { CreateCustomerConfigSchema } from "./createCustomer.schema";

/**
 * Stripe `create_customer` action handler.
 *
 * POSTs `/v1/customers` with the connected merchant's access token.
 * Sends the `Idempotency-Key` header so Stripe's 24-hour server-side
 * dedup window protects against retry storms (engine-level retries,
 * webhook re-deliveries, manual re-runs of the same logical run).
 *
 * Idempotency:
 *   - Key shape: `${runId}:${nodeId}:${actionType}` via
 *     `buildIdempotencyKey`. Stable across retries of the same run
 *     (`runId` is V2's session id at the handler boundary).
 *   - Stripe's window: 24 hours. Same key + same payload → cached
 *     response. Same key + different payload → Stripe returns a
 *     typed conflict error which `stripeRequest` surfaces via the
 *     `Stripe <method> <path> failed: ...` error string.
 *   - V2 ships ONLY the provider-side header — no session-side
 *     `checkReplay` / `recordFired` storage layer in this slice
 *     (per Slice 11 plan §"Idempotency strategy" — open question
 *     deferred to a future slice).
 *
 * accountId resolution: when the trigger is a Stripe webhook event,
 * `triggerEvent.accountId` is the connected merchant's
 * `stripe_user_id`. For non-Stripe-triggered runs (manual / cross-
 * provider), accountId is null and `refreshAndRetry`'s lookup picks
 * the user's single Stripe integration. Multi-Stripe-account users
 * (rare; one Stripe Connect platform per ChainReact user) should
 * use Stripe-triggered workflows for disambiguation.
 *
 * Output shape (downstream variable refs):
 *   { customerId, email, name, description, created, livemode, metadata }
 *
 *   Workflows can drill into `{{nodeId.customerId}}` for the
 *   downstream `create_payment_intent` / `create_subscription` /
 *   `update_customer` chains.
 */
export const createCustomer: ActionHandler = async (input) => {
  const config = CreateCustomerConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const idempotencyKey = buildIdempotencyKey({
    executionSessionId: input.runId,
    nodeId: input.nodeId,
    actionType: "stripe_action_create_customer",
  });

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    preflight: stripeLivemodePreflight({
      actionType: "create_customer",
      runTestMode: input.testMode === true,
    }),
    apiCall: (accessToken) =>
      customersCreate({
        accessToken,
        email: config.email,
        name: config.name,
        description: config.description,
        metadata: config.metadata,
        idempotencyKey,
      }),
  });

  return {
    output: {
      customerId: result.id,
      email: result.email,
      name: result.name,
      description: result.description,
      created: result.created,
      livemode: result.livemode,
      metadata: result.metadata,
    },
  };
};
