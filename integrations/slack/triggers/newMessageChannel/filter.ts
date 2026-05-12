import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.message.channel` canonical eventType.
 *
 * Fires on Slack `message` events whose `channel_type === "channel"`
 * (or C-prefixed channel id when channel_type is absent). The
 * normalizer at integrations/slack/webhooks/normalize.ts is the
 * authority on which events reach this filter — see §3 of
 * docs/slices/slack-2-1-messaging-reactions-plan.md.
 *
 * Per-workflow config:
 *   - `channelId` (optional). When present, only events from that
 *     specific channel match. When absent, every public-channel
 *     message matches (the trigger fires workspace-wide).
 *
 * Slack channel ids for public channels start with `C` followed by
 * uppercase alphanumerics — the regex pins the shape so a hand-
 * edited config that looks like a Slack-URL fragment fails Zod
 * parse → dispatcher fails closed.
 */
const ConfigSchema = z
  .object({
    channelId: z
      .string()
      .regex(/^C[A-Z0-9]+$/, "channelId must be a Slack public-channel id (C…).")
      .optional(),
  });
type Config = z.infer<typeof ConfigSchema>;

export const newMessageChannelFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.message.channel",
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
