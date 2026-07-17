import { z } from "zod";
import {
  CURRENCY_VALUES,
  FUEL_TYPE_VALUES,
  FUEL_UNIT_VALUES,
  JURISDICTION_VALUES,
  ODOMETER_UNIT_VALUES,
} from "./_staticOptions";

/**
 * Config schema for `motive:create_fuel_purchase` — MOTIVE-1.
 *
 * Required fields mirror Motive's `POST /v1/fuel_purchases` required set
 * (vehicle, driver, purchased_at, jurisdiction, fuel_type, fuel, fuel_unit).
 * Ids arrive as strings from the picker / variable mapping and are coerced to
 * integers by the handler. `.strict()` — no raw provider wire-format.
 */
export const CreateFuelPurchaseConfigSchema = z
  .object({
    vehicleId: z.string().min(1),
    driverId: z.string().min(1),
    purchasedAt: z.string().min(1),
    jurisdiction: z.enum(JURISDICTION_VALUES as [string, ...string[]]),
    fuelType: z.enum(FUEL_TYPE_VALUES as [string, ...string[]]),
    fuel: z.coerce.number().positive(),
    fuelUnit: z.enum(FUEL_UNIT_VALUES as [string, ...string[]]),
    totalCost: z.coerce.number().nonnegative().optional(),
    currency: z.enum(CURRENCY_VALUES as [string, ...string[]]).optional(),
    vendor: z.string().max(255).optional(),
    refNo: z.string().max(255).optional(),
    odometer: z.coerce.number().nonnegative().optional(),
    odometerUnit: z.enum(ODOMETER_UNIT_VALUES as [string, ...string[]]).optional(),
    location: z.string().max(500).optional(),
  })
  .strict();

export type CreateFuelPurchaseConfig = z.infer<typeof CreateFuelPurchaseConfigSchema>;
