import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.message.im` canonical eventType.
 *
 * Fires on Slack `message` events whose `channel_type === "im"`
 * (or D-prefixed channel id when channel_type is absent).
 *
 * Per-workflow config:
 *   - `withUserId` (optional). When present, only DMs whose sender
 *     (the `user` field on the message event) matches this user
 *     id fire the workflow. When absent, every incoming DM matches.
 *
 * Note: DM events fire when ANY user sends a DM to the bot's authed
 * user; the filter narrows to a specific *sender*, not a specific
 * DM channel.
 */
const ConfigSchema = z.object({
  withUserId: z
    .string()
    .regex(/^U[A-Z0-9]+$/, "withUserId must be a Slack user id (U…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const newDirectMessageFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.message.im",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    if (config.withUserId === undefined) return { kind: "match" };
    const sender = event.payload.user;
    if (sender === config.withUserId) return { kind: "match" };
    return {
      kind: "no-match",
      reason: `sender ${String(sender)} does not match filter ${config.withUserId}`,
    };
  },
};
