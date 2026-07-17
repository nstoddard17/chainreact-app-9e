import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  vehicleUpdate,
  type VehicleFields,
} from "@/integrations/_shared/motive/api/vehicles";
import { resolveCompany } from "./_resolveCompany";
import { UpdateVehicleConfigSchema } from "./updateVehicle.schema";

/**
 * Motive `update_vehicle` action handler — MOTIVE-1.
 *
 * `PUT /v1/vehicles/{id}` via the typed wrapper under `refreshAndRetry`.
 * `vehicleId` is a URL path id — passed as a string, NOT coerced. Only the
 * provided fields are sent (the wrapper omits `undefined`). Output is the shared
 * bounded vehicle projection — never the raw record.
 */
export const updateVehicle: ActionHandler = async (input) => {
  const config = UpdateVehicleConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const fields: Partial<VehicleFields> = {};
  if (config.number !== undefined) fields.number = config.number;
  if (config.make !== undefined) fields.make = config.make;
  if (config.model !== undefined) fields.model = config.model;
  if (config.year !== undefined) fields.year = config.year;
  if (config.vin !== undefined) fields.vin = config.vin;
  if (config.licensePlateState !== undefined)
    fields.licensePlateState = config.licensePlateState;
  if (config.licensePlateNumber !== undefined)
    fields.licensePlateNumber = config.licensePlateNumber;
  if (config.status !== undefined) fields.status = config.status;

  const vehicle = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      vehicleUpdate({ accessToken, vehicleId: config.vehicleId, fields }),
  });

  return { output: { ...vehicle } };
};
