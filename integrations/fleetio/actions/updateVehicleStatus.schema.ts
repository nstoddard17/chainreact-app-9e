import { z } from "zod";

/**
 * Runtime config schema for `fleetio:update_vehicle_status` (FLEETIO-3).
 *
 * `.strict()` — the authoritative validation of the RESOLVED config (the engine
 * pre-resolves `{{...}}` before the handler runs). Narrow by design: exactly the
 * two required fields, no generic vehicle-update passthrough.
 *
 * Both values are strings at the ChainReact boundary (the resolver commits
 * string ids, and upstream-mapped ids arrive as strings). `vehicleStatusId` must
 * be a POSITIVE-INTEGER string because Fleetio's wire type is `Id` (integer ≥1);
 * it is rejected here BEFORE any provider call and converted to a number only
 * inside the API layer. Status NAMES are never accepted — the resolver's values
 * are ids, and Fleetio does not document name-based status updates.
 */
export const UpdateVehicleStatusConfigSchema = z
  .object({
    vehicleId: z.string().trim().min(1, "A vehicle is required.").max(64),
    vehicleStatusId: z
      .string()
      .trim()
      .min(1, "A new status is required.")
      .max(64)
      .regex(/^[1-9][0-9]*$/, "The status id must be a positive whole number."),
  })
  .strict();

export type UpdateVehicleStatusConfig = z.infer<typeof UpdateVehicleStatusConfigSchema>;
