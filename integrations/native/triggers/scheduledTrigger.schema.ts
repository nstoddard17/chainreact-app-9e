import { z } from "zod";
import { isValidCronExpression } from "@/services/cron/cronExpression";

/**
 * Scheduled trigger — Native-nodes Slice 2 Commit 3.
 *
 * Per docs/slices/parity/native-nodes-2-tier-b-triggers-plan.md §5
 * + accepted NPD-N12 (UTC only) + NPD-N13 (no catch-up).
 *
 * Resolved-config schema is `.strict()`. Field set:
 *
 *   - `cronExpression`: required, 5-field UTC. Validated by the
 *     `services/cron/cronExpression.ts` facade — presets (`@hourly`),
 *     6-field (second-precision), and out-of-range values are
 *     rejected.
 *
 * Activation merges two more fields into the persisted trigger_resources
 * row config; those are NOT user-input and are NOT validated here:
 *
 *   - `nextFireAt`: ISO string written at activation + after every fire.
 *   - `schedulerState`: `"armed"` once activation has computed
 *     `nextFireAt`; absent until then.
 *
 * The cron-expression validator returns boolean, so we lift it through
 * `.refine()` rather than try/catch in the schema. Error message
 * surfaces in the route's 400 response shape.
 */

export const SCHEDULED_TRIGGER_PROVIDER = "native";
export const SCHEDULED_TRIGGER_EVENT_TYPE = "schedule.fired";

export const ScheduledTriggerConfigSchema = z
  .object({
    cronExpression: z
      .string()
      .min(1, "cronExpression is required.")
      .max(120, "cronExpression must be ≤ 120 characters.")
      .refine(isValidCronExpression, {
        message:
          "Invalid cron expression. Must be a 5-field UTC expression (presets, 6-field, and out-of-range values are rejected).",
      }),
  })
  .strict();
export type ScheduledTriggerConfig = z.infer<
  typeof ScheduledTriggerConfigSchema
>;
