import { z } from "zod";

/**
 * Config schema for the Motive `new_fuel_purchase` polling trigger — MOTIVE-1.
 *
 * Motive exposes NO fuel-purchase webhook, so this trigger polls
 * `GET /v1/fuel_purchases`. Baseline-first: activation seeds `snapshot.maxSeenId`
 * from the current highest fuel-purchase id so pre-existing purchases never fire
 * on the first poll. Firing keys on a NEW numeric id (not `purchased_at`), so a
 * back-dated manual entry still fires the moment it's created. `webhook_event_dedup`
 * on the fuel-purchase id is the cross-tick safety net.
 *
 * `vehicleId` is an optional Setup filter (watch one vehicle's fuel).
 * Server-managed state (`pollingEnabled`, `snapshot`, `polling`) is set by the
 * activation hook + advanced by the poll loop — never user-editable.
 */
export const NewFuelPurchaseConfigSchema = z
  .object({
    vehicleId: z.string().min(1).optional(),

    pollingEnabled: z.boolean().default(false),
    snapshot: z
      .object({
        maxSeenId: z.number().int().nonnegative(),
        capturedAt: z.string().min(1),
      })
      .optional(),
    polling: z
      .object({
        lastPolledAt: z.string().min(1),
      })
      .optional(),
  })
  .strict();

export type NewFuelPurchaseConfig = z.infer<typeof NewFuelPurchaseConfigSchema>;
