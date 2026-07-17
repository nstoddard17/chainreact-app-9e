import { z } from "zod";

/**
 * Config schema for `motive:delete_fuel_purchase` — MOTIVE-1.
 *
 * Deletes one fuel purchase by id. The id arrives as a string from a picker /
 * variable mapping. `.strict()` — no raw provider wire-format.
 */
export const DeleteFuelPurchaseConfigSchema = z
  .object({
    fuelPurchaseId: z.string().min(1),
  })
  .strict();

export type DeleteFuelPurchaseConfig = z.infer<typeof DeleteFuelPurchaseConfigSchema>;
