import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `native:schedule.fired` (scheduled trigger).
 *
 * Single user-input field: `cronExpression`. Validation lives in the
 * resolved-config schema (5-field UTC, presets / 6-field rejected). The
 * builder UI's CronField renderer (Slice 3.3) humanizes the expression
 * inline ("Runs every weekday at 9am") via a small client-side parser
 * dependency.
 *
 * `nextFireAt` and `schedulerState` are server-managed activation-time
 * fields — never user input. They are NOT exposed here.
 *
 * `key` uses the event-type suffix per the same convention as
 * `manual.run` (see manualTrigger.meta.ts).
 */
export const scheduledTriggerMeta: TriggerMeta = {
  key: "native:schedule.fired",
  provider: "native",
  type: "schedule.fired",
  displayName: "Scheduled Trigger",
  description:
    "Fires on a recurring schedule via a 5-field cron expression (UTC). Times are in UTC. No catch-up: missed fires while paused are not re-run.",
  category: "scheduling",
  activation: "scheduled",
  requiresIntegration: false,
  fields: [
    {
      name: "cronExpression",
      label: "Cron Expression",
      description: "5-field UTC cron expression. Minute Hour Day-of-month Month Day-of-week. Up to 120 characters.",
      type: "cron",
      required: true,
      placeholder: "0 9 * * 1-5",
    },
  ],
  payloadShape: [
    { name: "firedAt", type: "string", description: "ISO timestamp of the scheduled fire instant." },
  ],
  displayOrder: 20,
};
