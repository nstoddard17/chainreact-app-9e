import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.member_joined_channel` canonical eventType
 * (Slack 2.2).
 *
 * Fires on Slack `member_joined_channel` events. Slack delivers
 * one event per (user, channel) join — including the bot's own
 * joins. Workflow authors that want to ignore bot self-joins should
 * add a downstream guard on `payload.user`.
 *
 * Per-workflow config:
 *   - `channelId` (optional). When present, only events for that
 *     specific channel match. When absent, every member-joined
 *     event matches.
 *
 * channelId regex: `^[CG][A-Z0-9]+$`. Member-joined events fire for
 * public channels (C-prefixed) and private channels (modern C-
 * prefixed or legacy G-prefixed). DMs and group DMs do not fire
 * this event.
 *
 * Required scopes: `channels:read` (public) and `groups:read` (private)
 * — both required so Slack delivers events for both channel kinds.
 */
const ConfigSchema = z.object({
  channelId: z
    .string()
    .regex(/^[CG][A-Z0-9]+$/, "channelId must be a Slack channel id (C… or G…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const memberJoinedChannelFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.member_joined_channel",
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
