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
      // Slack 2.2 Commit 3 — channel lifecycle triggers
      // (channel_created, member_joined_channel, member_left_channel)
      // need groups:read so Slack delivers events for private
      // channels the bot has visibility into. Public channels are
      // already covered by channels:read above.
      "groups:read",
      // Slack 2.3 Commit 3 — public channel lifecycle / membership /
      // metadata admin (conversations.create / .archive / .unarchive /
      // .rename / .invite / .kick / .setTopic / .setPurpose for public
      // channels).
      "channels:manage",
      // Slack 2.3 Commit 3 — bot joins a public channel via
      // conversations.join. Separate from channels:manage by Slack's
      // scope model; required defensively per Slack 2.3 plan §6 #7.
      "channels:join",
      // Slack 2.3 Commit 3 — full admin for private channels:
      // create / archive / unarchive / rename / join / leave / invite /
      // kick / setTopic / setPurpose all dispatch through groups:write
      // when channel_type is "group".
      "groups:write",
      // Slack 2.3 Commit 4 — get_user_info + list_users actions need
      // users:read. Promoted from optional in Slack 2.1 to required
      // here. Existing workspaces with the optional grant will be
      // prompted to re-OAuth before user-lookup actions resolve.
      // NOTE: V2 intentionally does NOT also request `users:read.email`
      // — bot user objects will have `profile.email` set to null /
      // absent. Workflow authors that need email must add the scope
      // explicitly (PII surface; Slack 2.3 plan §6 decision 3).
      "users:read",
      // Slack 2.4 Commit 2 — file API wrappers + actions
      // (upload_file / download_file / get_file_info). `files:read`
      // covers `files.info` + URL-private GETs for download paths
      // and unlocks `file_shared` event delivery for the Slack 2.5
      // file_uploaded trigger. Per Slack 2.4 plan §6: bot-token only;
      // no user-token (xoxp-) variant, no unrelated chat/channel/user
      // scope additions. Existing workspaces re-OAuth on first file
      // action resolution (same UX as Slack 2.3's users:read promotion).
      "files:read",
      // Slack 2.4 Commit 2 — `files.getUploadURLExternal` +
      // `files.completeUploadExternal` for the upload_file action.
      "files:write",
    ],
    optional: [
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
