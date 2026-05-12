import { ProviderManifestSchema, type ProviderManifest } from "@/contracts/integration";

/**
 * Slack provider manifest.
 *
 * Defaults to OAuth v2 with bot tokens (xoxb-*). Slack's default v2 flow does
 * NOT return refresh tokens — token rotation is opt-in per app config and the
 * Slice 1 app does not enable it. Q3 refresh-and-retry is therefore verified
 * via mock providers (oauth-dispatcher.md tests #14 + #15), not against Slack.
 *
 * Slice 1 capabilities:
 *   - OAuth (connect / callback / no refresh / revoke)
 *   - Webhook trigger (Events API → public URL)
 *   - Action handler (chat.postMessage)
 */
export const slackManifest: ProviderManifest = ProviderManifestSchema.parse({
  id: "slack",
  displayName: "Slack",
  isEnabled: true,
  apiVersion: "v2",
  tokenScope: "workspace",
  oauthFlows: ["v2"],
  accountIdField: "team_id",
  scopes: {
    required: [
      "channels:history",
      "channels:read",
      "chat:write",
      // Slack 2.1 Commit 4 — send_direct_message opens a DM via
      // conversations.open then posts via chat.postMessage. `im:write`
      // covers the open call; `chat:write` covers the post.
      "im:write",
      // Slack 2.1 Commit 6 — reactions.add / reactions.remove.
      "reactions:write",
      // Slack 2.1 Commit 6 — pins.add / pins.remove.
      "pins:write",
      // Slack 2.1 Commit 8 — slack_new_direct_message trigger needs
      // im:history to receive DM message events.
      "im:history",
      // Slack 2.1 Commit 8 — slack_new_group_direct_message trigger.
      "mpim:history",
      // Slack 2.1 Commit 8 — reaction_added / reaction_removed triggers.
      "reactions:read",
      // Slack 2.2 Commit 2 — slack_new_message_private_channel trigger
      // needs groups:history to receive `message` events whose
      // channel_type === "group". Also unlocks get_messages /
      // get_thread_messages against private channels.
      "groups:history",
    ],
    optional: [
      "users:read",
      // Slack 2.1 Commit 8 — optional permission to post to public
      // channels the bot has NOT joined. Documented trade-off:
      // workspaces that grant it let the bot reach any public channel
      // without an explicit invite, which is more permissive but
      // avoids the "invite the bot first" UX wall. Default not
      // requested (per Marcus's slack-2-1 plan §7 decision).
      "chat:write.public",
    ],
    deprecated: [],
  },
  capabilities: {
    oauth: true,
    webhookTrigger: true,
    pollingTrigger: false,
    actions: true,
  },
  healthCheckIntervalMs: 4 * 60 * 60 * 1000, // 4h — per CLAUDE.md V1 health-check intervals.
  refreshable: false,
});
