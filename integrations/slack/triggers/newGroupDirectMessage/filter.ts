import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.message.mpim` canonical eventType.
 *
 * Fires on Slack `message` events whose `channel_type === "mpim"`
 * (or G-prefixed channel id when channel_type is absent). `mpim` =
 * multi-party DM (a group chat).
 *
 * Per-workflow config:
 *   - `channelId` (optional). When present, only events from that
 *     specific group-DM channel match. When absent, every group-DM
 *     message matches.
 *
 * Slack uses the `G` prefix historically for both private channels
 * and group DMs — both `groups:history` (for private channels) and
 * `mpim:history` (for group DMs) scopes share this prefix space.
 * Slack 2.1 adds only `mpim:history`; private channels arrive in
 * Slack 2.2 with `groups:history`.
 */
const ConfigSchema = z.object({
  channelId: z
    .string()
    .regex(/^G[A-Z0-9]+$/, "channelId must be a Slack group-DM channel id (G…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const newGroupDirectMessageFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.message.mpim",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    if (config.channelId === undefined) return { kind: "match" };
    const eventChannel = event.payload.channel;
    if (eventChannel === config.channelId) return { kind: "match" };
    return {
      kind: "no-match",
      reason: `channel ${String(eventChannel)} does not match filter ${config.channelId}`,
    };
  },
};
