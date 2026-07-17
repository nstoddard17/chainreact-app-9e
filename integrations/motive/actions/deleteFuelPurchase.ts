import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fuelPurchaseDelete } from "@/integrations/_shared/motive/api/fuelPurchases";
import { resolveCompany } from "./_resolveCompany";
import { DeleteFuelPurchaseConfigSchema } from "./deleteFuelPurchase.schema";

/**
 * Motive `delete_fuel_purchase` action handler — MOTIVE-1.
 *
 * `DELETE /v1/fuel_purchases/{id}` via the typed wrapper under
 * `refreshAndRetry`. Permanent — the record cannot be recovered. Output is a
 * bounded confirmation echoing the deleted id.
 */
export const deleteFuelPurchase: ActionHandler = async (input) => {
  const config = DeleteFuelPurchaseConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseDelete({
        accessToken,
        fuelPurchaseId: config.fuelPurchaseId,
      }),
  });

  return { output: { deleted: true, fuelPurchaseId: config.fuelPurchaseId } };
};
