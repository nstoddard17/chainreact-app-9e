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
      label: "Schedule",
      description:
        "When the workflow runs. Pick a preset (every hour, day, week…) or choose Custom for a 5-field UTC cron expression.",
      type: "cron",
      required: true,
      placeholder: "0 9 * * 1-5",
    },
  ],
  // Must match the fire payload built by the cron orchestrator
  // (services/cron/runScheduledTriggers.ts: { scheduledFireAt, cronExpression,
  // firedAt }) so the variable picker advertises exactly the references that
  // resolve at runtime. `scheduledFireAt` is the scheduled instant this run is
  // for; `firedAt` is when it actually fired (they differ slightly).
  payloadShape: [
    {
      name: "scheduledFireAt",
      type: "string",
      description: "ISO-8601 timestamp of the scheduled fire instant (the cron tick this run is for).",
    },
    {
      name: "cronExpression",
      type: "string",
      description: "The 5-field cron expression that scheduled this run.",
    },
    {
      name: "firedAt",
      type: "string",
      description: "ISO-8601 timestamp when the run actually fired.",
    },
  ],
  displayOrder: 20,
};
