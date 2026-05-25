import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:channel_created` (Slack 2.2).
 *
 * Webhook-activated trigger. The filter
 * (`integrations/slack/triggers/channelCreated/filter.ts`) takes an
 * empty config object — there is intentionally no narrow-by-channel
 * input because the event IS the creation of a new channel; narrowing
 * by `payload.channel.name` or `payload.channel.is_private` belongs in
 * a downstream guard step.
 *
 * Required scopes: `channels:read` (public channel creation) +
 * `groups:read` (private channel creation when the bot has visibility).
 * Both are in the manifest's required set.
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const channelCreatedTriggerMeta: TriggerMeta = {
  key: "slack:channel_created",
  provider: "slack",
  type: "channel_created",
  displayName: "Channel Created",
  description:
    "Fires when a new Slack channel is created in the workspace. Public channels are always delivered; private channels are delivered when the bot has visibility. To narrow by name or privacy add a downstream guard on the payload's channel object. Requires the channels:read and groups:read scopes.",
  category: "messaging",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'channel_created'." },
    {
      name: "channel",
      type: "object",
      description: "Channel resource — { id, name, created, creator, is_channel, is_private, ... }.",
    },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
  ],
  displayOrder: 70,
};
