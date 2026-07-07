import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customerGet } from "@/integrations/_shared/quickbooks/api/customers";
import { resolveRealm } from "./_resolveRealm";
import { GetCustomerConfigSchema } from "./getCustomer.schema";

/**
 * QuickBooks `get_customer` action handler — QUICKBOOKS-1.
 *
 * `GET /v3/company/{realmId}/customer/{id}` via the typed wrapper under
 * `refreshAndRetry`. Friendly not-found: an unknown id returns
 * `{ found: false, customer: null }` — it does NOT throw (Typeform
 * get_response precedent), so workflows can branch on `found`.
 */
export const getCustomer: ActionHandler = async (input) => {
  const config = GetCustomerConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const customer = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      customerGet({
        accessToken,
        realmId,
        customerId: config.customerId,
      }),
  });

  if (customer === null) {
    return { output: { found: false, customer: null } };
  }
  return { output: { found: true, customer } };
};
