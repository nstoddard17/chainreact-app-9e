import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.channel_created` canonical eventType (Slack 2.2).
 *
 * Fires on Slack `channel_created` events. Slack delivers this event
 * to the bot when a new public channel is created in the workspace
 * (and, with `groups:read`, when a private channel is created that
 * the bot has visibility into).
 *
 * Per-workflow config:
 *   - none. The filter matches every channel_created event for the
 *     workspace. Workflow authors that want to narrow by name or
 *     privacy can add a downstream guard step on `payload.channel.name`
 *     or `payload.channel.is_private`.
 *
 * Empty / non-object config parses successfully (z.object({}) strips
 * unknown keys). Fails closed if config is a primitive — the schema
 * pattern-matches the contract: parseConfig throws → dispatcher drops.
 *
 * Required scopes: `channels:read` (already required for public channel
 * creation) and `groups:read` (added in Slack 2.2 Commit 3 for private
 * channel visibility).
 */
const ConfigSchema = z.object({});
type Config = z.infer<typeof ConfigSchema>;

export const channelCreatedFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.channel_created",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(_event: TriggerEvent, _config: Config): FilterResult {
    return { kind: "match" };
  },
};
