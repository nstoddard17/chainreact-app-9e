import type { ActionHandler } from "@/services/execution/handlers/types";
import { fleetioUpdateVehicleStatus } from "../api/vehicles";
import { runFleetioApiCall } from "../execute";
import { UpdateVehicleStatusConfigSchema } from "./updateVehicleStatus.schema";
import { toUpdateVehicleStatusOutput } from "./updateVehicleStatus.output";

/**
 * `fleetio:update_vehicle_status` action handler (FLEETIO-3) — Fleetio's first
 * write. Sets ONE vehicle's status (mark it in service / out of service / in
 * shop / any account-defined status).
 *
 * `PATCH /vehicles/{id}` via the typed wrapper under `runFleetioApiCall` (the
 * shared execution seam: canonical account-scoped integration lookup + two-
 * credential decode at the call boundary + non-refreshable 401→reconnect).
 * Config is already fully resolved by the engine (Q2), so `vehicleId` /
 * `vehicleStatusId` are concrete strings whether picked or mapped from an
 * upstream step. The strict schema converts the status id to Fleetio's numeric
 * wire type ONLY after validation.
 *
 * Write-safety: the wrapper never auto-retries a PATCH on 429 (method-aware),
 * and the engine invokes a handler exactly once — so no automatic duplicate
 * write is possible. Output is the bounded post-update projection; a 404/422/403
 * throws a typed error (no `{success:false}` envelope, no fabricated output).
 */
export const updateVehicleStatus: ActionHandler = async (input) => {
  const config = UpdateVehicleStatusConfigSchema.parse(input.config);

  const vehicle = await runFleetioApiCall({
    accountId: input.accountId,
    apiCall: (credentials) =>
      fleetioUpdateVehicleStatus({
        apiKey: credentials.apiKey,
        accountToken: credentials.accountToken,
        vehicleId: config.vehicleId,
        // Validated positive-integer string → numeric wire type (API layer only).
        vehicleStatusId: Number(config.vehicleStatusId),
      }),
  });

  // Spread into a fresh literal so the bounded projection satisfies the engine's
  // Record<string, unknown> output contract (Get Vehicle precedent).
  return { output: { ...toUpdateVehicleStatusOutput(vehicle) } };
};
