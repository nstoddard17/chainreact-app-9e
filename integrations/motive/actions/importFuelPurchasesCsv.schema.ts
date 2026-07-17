import { z } from "zod";
import { FileRefSchema } from "@/contracts/file";
import {
  CURRENCY_VALUES,
  FUEL_TYPE_VALUES,
  FUEL_UNIT_VALUES,
  JURISDICTION_VALUES,
} from "./_staticOptions";

/**
 * Config schema for `motive:import_fuel_purchases_csv` — MOTIVE-1.
 *
 * Bulk fuel import. The user supplies EITHER a CSV file from an earlier step
 * (`csvFile`, already in Motive's template format — the common fuel-card export
 * case) OR structured `rows` that V2 serializes to CSV. Exactly one is required.
 * `.strict()` — raw JSON entry is never a Setup path.
 */
const FuelRowSchema = z
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
  })
  .strict();

export const ImportFuelPurchasesCsvConfigSchema = z
  .object({
    csvFile: FileRefSchema.optional(),
    rows: z.array(FuelRowSchema).min(1).max(1000).optional(),
    dryRun: z.boolean().default(false),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const hasFile = cfg.csvFile !== undefined;
    const hasRows = cfg.rows !== undefined && cfg.rows.length > 0;
    if (hasFile === hasRows) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide EITHER a CSV file OR structured rows — exactly one, not both and not neither.",
        path: ["csvFile"],
      });
    }
  });

export type ImportFuelPurchasesCsvConfig = z.infer<
  typeof ImportFuelPurchasesCsvConfigSchema
>;
export type FuelImportRow = z.infer<typeof FuelRowSchema>;
