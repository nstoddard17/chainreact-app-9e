import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { customerCreate } from "@/integrations/_shared/quickbooks/api/customers";
import { resolveRealm } from "./_resolveRealm";
import { CreateCustomerConfigSchema } from "./createCustomer.schema";

/**
 * QuickBooks `create_customer` action handler — QUICKBOOKS-1.
 *
 * `POST /v3/company/{realmId}/customer` via the typed wrapper under
 * `refreshAndRetry`. Sends ONLY the fields the user configured — no
 * hidden defaults, no invented values. A duplicate DisplayName surfaces
 * QBO's own validation error (sanitized by the wrapper — Message + code
 * only) so the run fails legibly instead of silently deduping.
 *
 * Output is the shared bounded customer projection — never the raw
 * record (SyncToken / MetaData / tax internals stay behind the wrapper).
 */
export const createCustomer: ActionHandler = async (input) => {
  const config = CreateCustomerConfigSchema.parse(input.config);
  const { realmId, providerAccountId } = await resolveRealm(input);

  const customer = await refreshAndRetry({
    accountId: input.accountId,
    provider: "quickbooks",
    providerAccountId,
    apiCall: (accessToken) =>
      customerCreate({
        accessToken,
        realmId,
        displayName: config.displayName,
        companyName: config.companyName,
        givenName: config.givenName,
        familyName: config.familyName,
        email: config.email,
        phone: config.phone,
        billingAddress: {
          line1: config.addressLine1,
          line2: config.addressLine2,
          city: config.city,
          state: config.state,
          postalCode: config.postalCode,
          country: config.country,
        },
        notes: config.notes,
      }),
  });

  return { output: { ...customer } };
};
