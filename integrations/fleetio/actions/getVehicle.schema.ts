import { z } from "zod";

/**
 * Runtime config schema for `fleetio:get_vehicle` (FLEETIO-2).
 *
 * `.strict()` — the authoritative validation of the RESOLVED config (the engine
 * pre-resolves `{{...}}` before the handler runs, so `vehicleId` here is a
 * concrete string). Narrow by design: exactly one required field, no generic
 * passthrough. A vehicle id selected from the `fleetio:vehicles` picker or
 * mapped from an upstream step both arrive as this string.
 */
export const GetVehicleConfigSchema = z
  .object({
    vehicleId: z
      .string()
      .trim()
      .min(1, "A vehicle is required.")
      .max(64),
  })
  .strict();

export type GetVehicleConfig = z.infer<typeof GetVehicleConfigSchema>;
