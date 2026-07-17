import { z } from "zod";

/**
 * Config schema for `motive:create_vehicle` — MOTIVE-1.
 *
 * Creates a vehicle via `POST /v1/vehicles`. Only `number` is required (Motive's
 * only required create field); everything else is optional descriptive detail.
 * `.strict()` — no raw provider wire-format.
 */
export const CreateVehicleConfigSchema = z
  .object({
    number: z.string().min(1),
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.string().optional(),
    vin: z.string().optional(),
    licensePlateState: z.string().optional(),
    licensePlateNumber: z.string().optional(),
  })
  .strict();

export type CreateVehicleConfig = z.infer<typeof CreateVehicleConfigSchema>;
