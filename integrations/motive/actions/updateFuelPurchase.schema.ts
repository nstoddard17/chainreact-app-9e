import { z } from "zod";
import {
  CURRENCY_VALUES,
  FUEL_TYPE_VALUES,
  FUEL_UNIT_VALUES,
  JURISDICTION_VALUES,
  ODOMETER_UNIT_VALUES,
} from "./_staticOptions";

/**
 * Config schema for `motive:update_fuel_purchase` — MOTIVE-1.
 *
 * `PUT /v1/fuel_purchases/{id}` — a partial update. Only `fuelPurchaseId` is
 * required; every other field mirrors the create schema's shape but is
 * optional. The superRefine requires at least one updatable field so the run
 * never sends an empty patch. Ids arrive as strings and are coerced by the
 * handler. `.strict()` — no raw provider wire-format.
 */
export const UpdateFuelPurchaseConfigSchema = z
  .object({
    fuelPurchaseId: z.string().min(1),
    vehicleId: z.string().min(1).optional(),
    driverId: z.string().min(1).optional(),
    purchasedAt: z.string().min(1).optional(),
    jurisdiction: z.enum(JURISDICTION_VALUES as [string, ...string[]]).optional(),
    fuelType: z.enum(FUEL_TYPE_VALUES as [string, ...string[]]).optional(),
    fuel: z.coerce.number().positive().optional(),
    fuelUnit: z.enum(FUEL_UNIT_VALUES as [string, ...string[]]).optional(),
    totalCost: z.coerce.number().nonnegative().optional(),
    currency: z.enum(CURRENCY_VALUES as [string, ...string[]]).optional(),
    vendor: z.string().max(255).optional(),
    refNo: z.string().max(255).optional(),
    odometer: z.coerce.number().nonnegative().optional(),
    odometerUnit: z.enum(ODOMETER_UNIT_VALUES as [string, ...string[]]).optional(),
    location: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const { fuelPurchaseId: _id, ...updatable } = config;
    const hasUpdate = Object.values(updatable).some((v) => v !== undefined);
    if (!hasUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update.",
      });
    }
  });

export type UpdateFuelPurchaseConfig = z.infer<typeof UpdateFuelPurchaseConfigSchema>;
