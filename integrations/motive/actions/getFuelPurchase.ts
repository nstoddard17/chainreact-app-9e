import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fuelPurchaseGet } from "@/integrations/_shared/motive/api/fuelPurchases";
import { resolveCompany } from "./_resolveCompany";
import { GetFuelPurchaseConfigSchema } from "./getFuelPurchase.schema";

/**
 * Motive `get_fuel_purchase` action handler — MOTIVE-1.
 *
 * `GET /v1/fuel_purchases/{id}` via the typed wrapper under `refreshAndRetry`.
 * Friendly not-found: an unknown id returns `{ found: false }` — it does NOT
 * throw (QuickBooks get_customer precedent), so workflows can branch on
 * `found`. Output is the shared bounded projection — never the raw record.
 */
export const getFuelPurchase: ActionHandler = async (input) => {
  const config = GetFuelPurchaseConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const purchase = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseGet({
        accessToken,
        fuelPurchaseId: config.fuelPurchaseId,
      }),
  });

  if (purchase === null) {
    return { output: { found: false } };
  }
  return { output: { found: true, ...purchase } };
};
