import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.message.group` canonical eventType (Slack 2.2).
 *
 * Fires on Slack `message` events whose `channel_type === "group"`
 * — Slack's own taxonomy term for private channel messages. The
 * normalizer treats `channel_type` as authoritative; the Slack 2.2
 * tightening intentionally removed the G-prefix fallback because
 * legacy private channels share that prefix with group DMs and the
 * two cannot be disambiguated from the id alone (see
 * integrations/slack/webhooks/normalize.ts and the Slack 2.2 deep-
 * gotcha entry in CLAUDE.md).
 *
 * Per-workflow config:
 *   - `channelId` (optional). When present, only events from that
 *     specific private channel match. When absent, every private-
 *     channel message matches.
 *
 * channelId regex: `^[CG][A-Z0-9]+$`. Modern private channels carry
 * C-prefixed ids; legacy private channels carry G-prefixed ids.
 * Both are accepted — the runtime `channel_type` check pins kind,
 * the id is only used as the equality target.
 *
 * Required scope: `groups:history`. Without it, Slack will not
 * deliver `message` events for private channels (the trigger will
 * silently never fire).
 */
const ConfigSchema = z.object({
  channelId: z
    .string()
    .regex(
      /^[CG][A-Z0-9]+$/,
      "channelId must be a Slack private-channel id (C… or legacy G…).",
    )
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const newMessagePrivateChannelFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.message.group",
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
