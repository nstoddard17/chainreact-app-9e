import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";
import { normalizeReactionName } from "@/integrations/slack/actions/normalizeReactionName";

/**
 * Filter for the `slack.reaction_removed` canonical eventType.
 *
 * Same shape and semantics as reactionAddedFilter — fires on
 * `reaction_removed` events instead. See reactionAdded/filter.ts
 * for the contract details.
 */
const ConfigSchema = z.object({
  reactionEmoji: z.string().min(1).optional(),
  channelId: z
    .string()
    .regex(/^C[A-Z0-9]+$/, "channelId must be a Slack public-channel id (C…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const reactionRemovedFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.reaction_removed",
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
