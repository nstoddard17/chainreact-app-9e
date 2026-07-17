import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  fuelPurchaseUpdate,
  type FuelPurchaseFields,
} from "@/integrations/_shared/motive/api/fuelPurchases";
import { resolveCompany } from "./_resolveCompany";
import { toMotiveId } from "./_ids";
import { UpdateFuelPurchaseConfigSchema } from "./updateFuelPurchase.schema";

/**
 * Motive `update_fuel_purchase` action handler — MOTIVE-1.
 *
 * `PUT /v1/fuel_purchases/{id}` via the typed wrapper under `refreshAndRetry`.
 * Builds a partial patch from ONLY the provided fields (the wrapper's
 * `toWireBody` sends only what is set), coercing ids to integers. Output is the
 * shared bounded projection — never the raw record.
 */
export const updateFuelPurchase: ActionHandler = async (input) => {
  const config = UpdateFuelPurchaseConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const fields: Partial<FuelPurchaseFields> = {};
  if (config.vehicleId !== undefined) fields.vehicleId = toMotiveId(config.vehicleId, "vehicle id");
  if (config.driverId !== undefined) fields.driverId = toMotiveId(config.driverId, "driver id");
  if (config.purchasedAt !== undefined) fields.purchasedAt = config.purchasedAt;
  if (config.jurisdiction !== undefined) fields.jurisdiction = config.jurisdiction;
  if (config.fuelType !== undefined) fields.fuelType = config.fuelType;
  if (config.fuel !== undefined) fields.fuel = config.fuel;
  if (config.fuelUnit !== undefined) fields.fuelUnit = config.fuelUnit;
  if (config.totalCost !== undefined) fields.totalCost = config.totalCost;
  if (config.currency !== undefined) fields.currency = config.currency;
  if (config.vendor !== undefined) fields.vendor = config.vendor;
  if (config.refNo !== undefined) fields.refNo = config.refNo;
  if (config.odometer !== undefined) fields.odometer = config.odometer;
  if (config.odometerUnit !== undefined) fields.odometerUnit = config.odometerUnit;
  if (config.location !== undefined) fields.location = config.location;

  const purchase = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      fuelPurchaseUpdate({
        accessToken,
        fuelPurchaseId: config.fuelPurchaseId,
        fields,
      }),
  });

  return { output: { ...purchase } };
};
