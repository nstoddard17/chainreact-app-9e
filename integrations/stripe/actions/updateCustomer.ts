import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customersUpdate } from "../api/customers";
import { UpdateCustomerConfigSchema } from "./updateCustomer.schema";

/**
 * Stripe `update_customer` action handler.
 *
 * POSTs `/v1/customers/{customerId}` with the merchant's access
 * token. No `Idempotency-Key` header — the resource id (`customerId`)
 * already provides server-side dedup; sending the same update twice
 * yields the same final state. (Q4 idempotency-keyed actions are
 * limited to creates per the Slice 11 plan §17.)
 *
 * Output shape: same as `create_customer` (echoes the updated
 * customer state).
 */
export const updateCustomer: ActionHandler = async (input) => {
  const config = UpdateCustomerConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const result = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    apiCall: (accessToken) =>
      customersUpdate({
        accessToken,
        customerId: config.customerId,
        email: config.email,
        name: config.name,
        description: config.description,
        metadata: config.metadata,
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
