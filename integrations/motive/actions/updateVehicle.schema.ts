import { z } from "zod";

/**
 * Config schema for `motive:update_vehicle` — MOTIVE-1.
 *
 * Updates a vehicle via `PUT /v1/vehicles/{id}`. `vehicleId` is a path id and
 * stays a string (not coerced). At least one updatable field must be provided —
 * a no-op update is rejected. `.strict()` — no raw provider wire-format.
 */
export const UpdateVehicleConfigSchema = z
  .object({
    vehicleId: z.string().min(1),
    number: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.string().optional(),
    vin: z.string().optional(),
    licensePlateState: z.string().optional(),
    licensePlateNumber: z.string().optional(),
    status: z.string().optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const hasUpdate =
      config.number !== undefined ||
      config.make !== undefined ||
      config.model !== undefined ||
      config.year !== undefined ||
      config.vin !== undefined ||
      config.licensePlateState !== undefined ||
      config.licensePlateNumber !== undefined ||
      config.status !== undefined;
    if (!hasUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update.",
      });
    }
  });

export type UpdateVehicleConfig = z.infer<typeof UpdateVehicleConfigSchema>;
