import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customerSearch } from "@/integrations/_shared/quickbooks/api/customers";
import { resolveRealm } from "./_resolveRealm";
import { FindCustomerConfigSchema } from "./findCustomer.schema";

/** Bounded match count — find is a lookup, not a listing action. */
const MAX_MATCHES = 10;

/**
 * QuickBooks `find_customer` action handler — QUICKBOOKS-1.
 *
 * Exact-match search on ONE field (email / display name / company name)
 * via the query wrapper (escaped server-side; no OR in QBO's query
 * language, so one field per run is the honest contract).
 *
 * Friendly not-found: no match returns `{ found: false, matchCount: 0,
 * customer: null, customers: [] }` — it does NOT throw (Stripe find_* /
 * Typeform get_response precedent), so workflows can branch on `found`.
 * `customer` is the first match for the common map-one-field case;
 * `customers` carries up to 10 bounded projections.
 */
export const findCustomer: ActionHandler = async (input) => {
  const config = FindCustomerConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const matches = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      customerSearch({
        accessToken,
        realmId,
        field: config.searchBy,
        value: config.value,
        maxResults: MAX_MATCHES,
      }),
  });

  if (matches.length === 0) {
    return {
      output: {
        found: false,
        matchCount: 0,
        customer: null,
        customers: [],
      },
    };
  }

  return {
    output: {
      found: true,
      matchCount: matches.length,
      customer: matches[0],
      customers: matches,
    },
  };
};
