import { z } from "zod";
import { FUEL_TYPE_VALUES } from "./_staticOptions";

/**
 * Config schema for `motive:list_fuel_purchases` — MOTIVE-1.
 *
 * Single-page list (rule 9): returns one page; the author composes a loop on
 * `hasMore`-style paging via `pageNo`. All filters optional. Ids arrive as
 * strings and are coerced by the handler. `.strict()` — no raw provider
 * wire-format.
 */
export const ListFuelPurchasesConfigSchema = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    fuelType: z.enum(FUEL_TYPE_VALUES as [string, ...string[]]).optional(),
    vehicleId: z.string().optional(),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    pageNo: z.coerce.number().int().min(1).default(1),
  })
  .strict();

export type ListFuelPurchasesConfig = z.infer<typeof ListFuelPurchasesConfigSchema>;
