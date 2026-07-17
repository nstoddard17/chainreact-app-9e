import { z } from "zod";

/**
 * Config schema for `motive:update_driver` — MOTIVE-1.
 *
 * Updates a driver via `PUT /v1/users/{id}`. `driverId` is a path id and stays
 * a string (not coerced). At least one updatable field must be provided — a
 * no-op update is rejected. `.strict()` — no raw provider wire-format.
 */
export const UpdateDriverConfigSchema = z
  .object({
    driverId: z.string().min(1),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    status: z.string().optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const hasUpdate =
      config.firstName !== undefined ||
      config.lastName !== undefined ||
      config.phone !== undefined ||
      config.email !== undefined ||
      config.status !== undefined;
    if (!hasUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update.",
      });
    }
  });

export type UpdateDriverConfig = z.infer<typeof UpdateDriverConfigSchema>;
