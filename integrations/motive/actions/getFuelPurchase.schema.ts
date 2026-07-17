import { z } from "zod";

/**
 * Config schema for `motive:get_fuel_purchase` — MOTIVE-1.
 *
 * Reads one fuel purchase by id. The id arrives as a string from a picker /
 * variable mapping (usually a New Fuel Purchase trigger or a List step).
 * `.strict()` — no raw provider wire-format.
 */
export const GetFuelPurchaseConfigSchema = z
  .object({
    fuelPurchaseId: z.string().min(1),
  })
  .strict();

export type GetFuelPurchaseConfig = z.infer<typeof GetFuelPurchaseConfigSchema>;
