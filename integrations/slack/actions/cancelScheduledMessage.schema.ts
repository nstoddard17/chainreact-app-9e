import { z } from "zod";

/**
 * Resolved-config schema for the Slack cancel_scheduled_message action.
 *
 * Identifies a scheduled message via `(channel, scheduledMessageId)` —
 * the same id Slack returned from `schedule_message.output`.
 *
 * Slack returns success for legitimate cancellations and
 * `invalid_scheduled_message_id` when the id is unknown or already
 * delivered. The wrapper surfaces the Slack error code directly.
 */
export const CancelScheduledMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  scheduledMessageId: z
    .string()
    .min(1, "scheduledMessageId is required (from schedule_message.output)."),
});
export type CancelScheduledMessageConfig = z.infer<typeof CancelScheduledMessageConfigSchema>;
