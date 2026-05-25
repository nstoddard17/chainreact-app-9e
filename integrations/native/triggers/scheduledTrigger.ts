import { z } from "zod";
import { registerNativeActivation } from "@/services/triggers/activationRegistry";
import { computeNextFireTime } from "@/services/cron/cronExpression";
import {
  ScheduledTriggerConfigSchema,
  SCHEDULED_TRIGGER_EVENT_TYPE,
  SCHEDULED_TRIGGER_PROVIDER,
} from "./scheduledTrigger.schema";

/**
 * Scheduled trigger — Native-nodes Slice 2 Commit 3.
 *
 * Side-effect module: registering the native activation hook at import
 * time. The hook computes the FIRST `nextFireAt` based on the cron
 * expression and the activation instant. The cron orchestrator at
 * `services/cron/runScheduledTriggers.ts` advances `nextFireAt` on
 * every fire.
 *
 * No deactivation hook needed — `services/triggers/lifecycle.ts`'s
 * `unregisterWorkflowTriggers` deletes the trigger_resources row,
 * which is sufficient (no provider-side subscription to tear down).
 */

export {
  SCHEDULED_TRIGGER_EVENT_TYPE,
  SCHEDULED_TRIGGER_PROVIDER,
  ScheduledTriggerConfigSchema,
  type ScheduledTriggerConfig,
} from "./scheduledTrigger.schema";

/**
 * Shape of the activation-merged config persisted on the
 * `trigger_resources.config` row. NOT exported as a Zod schema —
 * `nextFireAt` / `schedulerState` are server-set, not user-input.
 *
 * - `cronExpression`: echoed from the user-input schema.
 * - `nextFireAt`: ISO timestamp of the next scheduled fire (strictly
 *   after the activation instant).
 * - `schedulerState`: `"armed"` once activation has computed a
 *   `nextFireAt`; the cron orchestrator reads this field as a
 *   defense-in-depth check.
 */
export interface ScheduledTriggerStoredConfig {
  cronExpression: string;
  nextFireAt: string;
  schedulerState: "armed";
}

/**
 * Defense-in-depth schema used by the cron orchestrator when reading
 * a `trigger_resources` row. Tolerant of missing `schedulerState` for
 * historical rows.
 */
export const ScheduledTriggerStoredConfigSchema = z.object({
  cronExpression: z.string().min(1),
  nextFireAt: z.string().min(1),
  schedulerState: z.literal("armed").optional(),
});

registerNativeActivation(
  SCHEDULED_TRIGGER_PROVIDER,
  SCHEDULED_TRIGGER_EVENT_TYPE,
  async ({ node }) => {
    // Re-parse the node's config defensively. `lifecycle.ts` doesn't
    // re-validate; the orchestrator that called us already ran the
    // schema at PATCH time but a stale draft from before this schema
    // landed could slip through.
    const config = ScheduledTriggerConfigSchema.parse(node.config);

    const nextFireAt = computeNextFireTime(config.cronExpression);
    if (!nextFireAt) {
      // isValidCronExpression already passed inside the schema refine,
      // so this branch is defense-in-depth (e.g. cron-parser quirk
      // produces no future fire for an exotic expression).
      throw new Error(
        `scheduled_trigger: cron expression "${config.cronExpression}" produced no next fire time.`,
      );
    }

    const patch: Record<string, unknown> = {
      cronExpression: config.cronExpression,
      nextFireAt: nextFireAt.toISOString(),
      schedulerState: "armed",
    } satisfies ScheduledTriggerStoredConfig;
    return patch;
  },
);
