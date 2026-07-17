import type { ActionHandler } from "@/services/execution/handlers/types";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { vehicleCreate } from "@/integrations/_shared/motive/api/vehicles";
import { resolveCompany } from "./_resolveCompany";
import { CreateVehicleConfigSchema } from "./createVehicle.schema";

/**
 * Motive `create_vehicle` action handler — MOTIVE-1.
 *
 * `POST /v1/vehicles` via the typed wrapper under `refreshAndRetry`. Sends ONLY
 * the configured fields (the wrapper omits `undefined`). Output is the shared
 * bounded vehicle projection — never the raw record.
 */
export const createVehicle: ActionHandler = async (input) => {
  const config = CreateVehicleConfigSchema.parse(input.config);
  const { providerAccountId } = await resolveCompany(input);

  const vehicle = await refreshAndRetry({
    accountId: input.accountId,
    provider: "motive",
    providerAccountId,
    apiCall: (accessToken) =>
      vehicleCreate({
        accessToken,
        fields: {
          number: config.number,
          make: config.make,
          model: config.model,
          year: config.year,
          vin: config.vin,
          licensePlateState: config.licensePlateState,
          licensePlateNumber: config.licensePlateNumber,
        },
      }),
  });

  return { output: { ...vehicle } };
};
