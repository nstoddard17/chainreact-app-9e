import { z } from "zod";

/**
 * Resolved-config schema for the Slack schedule_message action.
 *
 * `postAt` accepts a string in one of two strict formats — see
 * `./parsePostAt.ts` for the contract. The schema enforces non-empty
 * only; the handler runs `parsePostAt` at the handler boundary to
 * convert + reject naive datetimes loudly. Schema and helper share
 * the same intent; splitting the work keeps the schema declarative.
 *
 * No silent "now + delta" mode (V1's `scheduleType: "delay"` is NOT
 * ported — per slack 2.1 plan §8 Q11). Caller computes the absolute
 * Unix-second timestamp upstream if a relative delay is desired.
 *
 * `threadTs` (optional): post as a thread reply, same semantics as
 * send_channel_message.
 */
export const ScheduleMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  text: z.string().min(1, "Message text is required."),
  postAt: z
    .string()
    .min(1, "Scheduled post time (postAt) is required — no silent default."),
  threadTs: z.string().min(1).optional(),
});
export type ScheduleMessageConfig = z.infer<typeof ScheduleMessageConfigSchema>;
