import type { ActionHandler } from "@/services/execution/handlers/types";
import { fleetioGetVehicle } from "../api/vehicles";
import { runFleetioApiCall } from "../execute";
import { GetVehicleConfigSchema } from "./getVehicle.schema";
import { toGetVehicleOutput } from "./getVehicle.output";

/**
 * `fleetio:get_vehicle` action handler (FLEETIO-2) — read-only.
 *
 * `GET /vehicles/{id}` via the typed wrapper under `runFleetioApiCall` (the
 * Fleetio execution seam: canonical account-scoped integration lookup + two-
 * credential decode at the call boundary + non-refreshable 401→reconnect).
 *
 * Config is already fully resolved by the engine (Q2) — `vehicleId` is a
 * concrete string here, whether it was picked from `fleetio:vehicles` or mapped
 * from an upstream `{{nodeId.vehicleId}}`. A missing / removed id surfaces as
 * `FleetioNotFoundError` (thrown by the wrapper on 404) — the handler does NOT
 * swallow it into a `{ found: false }` envelope; Get Vehicle targets a specific
 * id, so "not found" is a real, classifiable failure. Output is the bounded
 * projection — never the raw record.
 */
export const getVehicle: ActionHandler = async (input) => {
  const config = GetVehicleConfigSchema.parse(input.config);

  const vehicle = await runFleetioApiCall({
    accountId: input.accountId,
    apiCall: (credentials) =>
      fleetioGetVehicle({
        apiKey: credentials.apiKey,
        accountToken: credentials.accountToken,
        vehicleId: config.vehicleId,
      }),
  });

  // Spread into a fresh literal so the bounded projection satisfies the
  // engine's `Record<string, unknown>` output contract (Motive precedent).
  return { output: { ...toGetVehicleOutput(vehicle) } };
};
