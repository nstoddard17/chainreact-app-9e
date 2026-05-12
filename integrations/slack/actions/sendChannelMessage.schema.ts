import { z } from "zod";

/**
 * Resolved-config schema for the Slack send_channel_message action.
 *
 * The engine pre-resolves all `{{...}}` references via the variable
 * resolver before dispatching the handler (rule §"Engine pre-resolution"),
 * so by the time this schema runs every value is already a concrete string.
 *
 * `channel` accepts either a Slack id (`C…`, `D…`) or a `#name` form —
 * Slack resolves names server-side. Both are non-empty strings.
 *
 * `threadTs` (optional, Slack 2.1 expansion): when present, post as a
 * thread reply to the message with this Slack timestamp. Format is
 * `"<seconds>.<microseconds>"` exactly as Slack returns (e.g.
 * "1730000000.000123"). No Slack-URL parsing — caller has already
 * extracted the ts at variable resolution time.
 */
export const SendChannelMessageConfigSchema = z.object({
  channel: z.string().min(1, "Slack channel is required."),
  text: z.string().min(1, "Message text is required."),
  threadTs: z.string().min(1).optional(),
});
export type SendChannelMessageConfig = z.infer<typeof SendChannelMessageConfigSchema>;
