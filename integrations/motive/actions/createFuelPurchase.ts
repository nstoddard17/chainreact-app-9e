import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { fuelPurchaseCreate } from "@/integrations/_shared/motive/api/fuelPurchases";
import { resolveCompany } from "./_resolveCompany";
import { toMotiveId } from "./_ids";
import { CreateFuelPurchaseConfigSchema } from "./createFuelPurchase.schema";

/**
 * Motive `create_fuel_purchase` action handler — MOTIVE-1.
 *
 * `POST /v1/fuel_purchases` via the typed wrapper under `refreshAndRetry`. Sends
 * ONLY the configured fields — no hidden defaults beyond the user-visible
 * `fuel_unit`/`currency` defaults surfaced in the meta. Output is the shared
 * bounded fuel-purchase projection — never the raw record.
 */
export const createFuelPurchase: ActionHandler = async (input) => {
  const config = CreateFuelPurchaseConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const purchase = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseCreate({
        accessToken,
        fields: {
          vehicleId: toMotiveId(config.vehicleId, "vehicle id"),
          driverId: toMotiveId(config.driverId, "driver id"),
          purchasedAt: config.purchasedAt,
          jurisdiction: config.jurisdiction,
          fuelType: config.fuelType,
          fuel: config.fuel,
          fuelUnit: config.fuelUnit,
          totalCost: config.totalCost,
          currency: config.currency,
          vendor: config.vendor,
          refNo: config.refNo,
          odometer: config.odometer,
          odometerUnit: config.odometerUnit,
          location: config.location,
        },
      }),
  });

  return { output: { ...purchase } };
};
