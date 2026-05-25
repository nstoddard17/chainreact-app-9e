import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";
import { normalizeReactionName } from "@/integrations/slack/actions/normalizeReactionName";

/**
 * Filter for the `slack.reaction_added` canonical eventType.
 *
 * Fires on Slack `reaction_added` events. The reaction emoji name is
 * normalized on both sides (the config value and the Slack payload's
 * `reaction` field) so a config of `:thumbsup:` matches a Slack event
 * `reaction: "thumbsup"` and vice versa. See
 * integrations/slack/actions/normalizeReactionName.ts for the rules
 * — same helper Commit 6 used in add_reaction / remove_reaction.
 *
 * Per-workflow config:
 *   - `reactionEmoji` (optional). Match only when the reaction name
 *     (after normalization on both sides) matches.
 *   - `channelId` (optional). Match only when the reacted-to
 *     message's channel matches. Slack's reaction events carry the
 *     channel at `payload.item.channel`, not `payload.channel`.
 *
 * Both filters AND-combine. Empty config matches every reaction.
 */
const ConfigSchema = z.object({
  reactionEmoji: z.string().min(1).optional(),
  channelId: z
    .string()
    .regex(/^C[A-Z0-9]+$/, "channelId must be a Slack public-channel id (C…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const reactionAddedFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.reaction_added",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    if (config.reactionEmoji !== undefined) {
      const want = normalizeReactionName(config.reactionEmoji);
      const got = normalizeReactionName(String(event.payload.reaction ?? ""));
      if (want !== got) {
        return {
          kind: "no-match",
          reason: `reaction ${got || "<empty>"} does not match filter ${want}`,
        };
      }
    }
    if (config.channelId !== undefined) {
      const item = event.payload.item;
      const eventChannel =
        item && typeof item === "object" && "channel" in item
          ? (item as { channel?: unknown }).channel
          : undefined;
      if (eventChannel !== config.channelId) {
        return {
          kind: "no-match",
          reason: `item channel ${String(eventChannel)} does not match filter ${config.channelId}`,
        };
      }
    }
    return { kind: "match" };
  },
};
