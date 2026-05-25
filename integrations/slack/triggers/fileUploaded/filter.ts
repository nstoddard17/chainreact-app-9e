import { z } from "zod";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type {
  FilterResult,
  TriggerFilter,
} from "@/core/triggers/filterContract";

/**
 * Filter for the `slack.file_shared` canonical eventType (Slack 2.5).
 *
 * Fires on Slack `file_shared` events. Slack delivers this event when
 * a file is shared into a channel the bot has visibility into. The
 * raw Slack payload carries only file_id / user_id / channel_id /
 * event_ts (plus a partial `file: { id }` stub) — NO name, mimeType,
 * size, or url. Workflows that need file metadata or bytes compose
 * `slack:get_file_info` (→ FileRef(provider_url) + structured metadata)
 * or `slack:download_file` (→ FileRef(v2_storage) + staged bytes)
 * downstream. The trigger payload itself does NOT emit a FileRef —
 * P-S3 strict-arm validation would reject a partial.
 *
 * Per-workflow config:
 *   - `channelId` (optional). When present, only events for that
 *     specific channel match. When absent, every file_shared event
 *     matches.
 *
 * channelId regex: `^[CG][A-Z0-9]+$`. Matches public channels (C-
 * prefixed) and legacy private channels (G-prefixed). Modern private
 * channels also use C-prefixed ids in `file_shared` payloads. DMs
 * (D-prefixed) are not in the v1 surface — Slack delivery for files
 * shared into DMs under bot scopes is not exercised today.
 *
 * Payload field rule: read `payload.channel_id`, NOT `payload.channel`.
 * Slack's `file_shared` event uses snake_case `_id`-suffixed fields
 * (`file_id`, `user_id`, `channel_id`) unlike the `message` event which
 * uses bare `channel`. Easy to get wrong by copy-paste from
 * memberJoinedChannel; the unit test pins this explicitly.
 *
 * Required scopes: `files:read` (granted in Slack 2.4 — covers both
 * the file actions and event delivery for `file_shared`).
 */
const ConfigSchema = z.object({
  channelId: z
    .string()
    .regex(/^[CG][A-Z0-9]+$/, "channelId must be a Slack channel id (C… or G…).")
    .optional(),
});
type Config = z.infer<typeof ConfigSchema>;

export const fileUploadedFilter: TriggerFilter<Config> = {
  provider: "slack",
  eventType: "slack.file_shared",
  parseConfig(rawConfig: unknown): Config {
    return ConfigSchema.parse(rawConfig);
  },
  evaluate(event: TriggerEvent, config: Config): FilterResult {
    if (config.channelId === undefined) return { kind: "match" };
    const eventChannelId = event.payload.channel_id;
    if (eventChannelId === config.channelId) return { kind: "match" };
    return {
      kind: "no-match",
      reason: `channel ${String(eventChannelId)} does not match filter ${config.channelId}`,
    };
  },
};
