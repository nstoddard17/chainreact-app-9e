import type { ActionHandler } from "@/services/execution/handlers/types";
import {
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { stripeLivemodePreflight } from "@/integrations/stripe/security/livemodePolicy";
import { NotFoundError } from "@/integrations/_shared/stripe/errors";
import {
  customersGet,
  customersList,
  type StripeCustomer,
} from "../api/customers";
import { FindCustomerConfigSchema } from "./findCustomer.schema";

/**
 * Stripe `find_customer` action handler.
 *
 * Two lookup paths:
 *   - by customerId (GET `/v1/customers/{customerId}`) — direct.
 *     404 → `{ found: false, customer: null }` (NOT thrown).
 *   - by email (GET `/v1/customers?email=...&limit=1`) — list filter.
 *     Empty list → `{ found: false }`. Multiple matches return the
 *     first (Stripe's email index isn't unique; workflow authors with
 *     duplicate-email scenarios should use customerId lookup).
 *
 * The 404 → `{found: false}` mapping happens HERE (not in the
 * wrapper), because the wrapper layer's contract is "throw on 404"
 * and `find_customer`'s contract is "no-throw on no-match." Catching
 * `NotFoundError` keeps the wrapper's typed-error contract clean
 * while tailoring the handler's UX.
 *
 * Output shape:
 *   { found: boolean, customer: { customerId, email, name, ... } | null }
 *
 *   The `customer` field mirrors `create_customer`'s output shape
 *   when `found: true` — drop-in replacement for downstream chains
 *   that consume `{{nodeId.customer.customerId}}`.
 */
export const findCustomer: ActionHandler = async (input) => {
  const config = FindCustomerConfigSchema.parse(input.config);

  const accountId =
    input.triggerEvent.provider === "stripe"
      ? input.triggerEvent.accountId
      : null;

  const preflight = stripeLivemodePreflight({
    actionType: "find_customer",
    runTestMode: input.testMode === true,
  });

  if (config.customerId !== undefined) {
    try {
      const result = await refreshAndRetry({
        userId: input.userId,
        provider: "stripe",
        accountId,
        preflight,
        apiCall: (accessToken) =>
          customersGet({
            accessToken,
            customerId: config.customerId!,
          }),
      });
      return { output: { found: true, customer: customerOutput(result) } };
    } catch (err) {
      if (err instanceof NotFoundError) {
        return { output: { found: false, customer: null } };
      }
      // Re-throw Unauthorized401Error and any other error —
      // refreshAndRetry already handled the refresh path before the
      // throw bubbled up, so a remaining 401 is genuinely fatal.
      // Defensive `instanceof` keeps lint happy.
      if (err instanceof Unauthorized401Error) throw err;
      throw err;
    }
  }

  // email path — list filter. No 404 possible (list returns 200 with
  // empty data on no match).
  const list = await refreshAndRetry({
    userId: input.userId,
    provider: "stripe",
    accountId,
    preflight,
    apiCall: (accessToken) =>
      customersList({
        accessToken,
        email: config.email!,
        limit: 1,
      }),
  });

  const first = list.data[0];
  if (!first) {
    return { output: { found: false, customer: null } };
  }
  return { output: { found: true, customer: customerOutput(first) } };
};

function customerOutput(c: StripeCustomer): Record<string, unknown> {
  return {
    customerId: c.id,
    email: c.email,
    name: c.name,
    description: c.description,
    created: c.created,
    livemode: c.livemode,
    metadata: c.metadata,
  };
}
