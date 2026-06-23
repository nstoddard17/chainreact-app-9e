import type { TriggerMeta } from "@/contracts/triggerMeta";

/**
 * Builder-facing metadata for `slack:file_shared` (Slack 2.5).
 *
 * Webhook-activated trigger. The runtime filter
 * (`integrations/slack/triggers/fileUploaded/filter.ts`) reads
 * `payload.channel_id` (snake_case `_id`-suffixed fields) — Slack's
 * `file_shared` event shape differs from the `message` event's bare
 * `channel`. The payloadShape below pins the snake_case keys
 * explicitly so workflow authors mapping `{{trigger.channel_id}}` /
 * `{{trigger.file_id}}` get the right path on the first try.
 *
 * The trigger payload itself does NOT emit a FileRef — Slack's raw
 * payload carries only id stubs (file_id / user_id / channel_id /
 * event_ts plus a partial `file: { id }` stub). Workflows that need
 * file metadata or bytes compose `slack:get_file_info` or
 * `slack:download_file` downstream. See the runtime filter's
 * implementation notes for the rationale.
 *
 * Required scope: `files:read` (manifest required set — covers both
 * the file action handlers and `file_shared` event delivery).
 *
 * Shared-infrastructure exempt — see SHARED_INFRA_EXEMPT_KEYS.
 */
export const fileUploadedTriggerMeta: TriggerMeta = {
  key: "slack:file_shared",
  provider: "slack",
  type: "file_shared",
  displayName: "File Uploaded",
  description:
    "Fires when a file is shared into a Slack channel the bot has visibility into. The payload carries only file/channel/user ids — use the slack:get_file_info or slack:download_file action downstream to fetch metadata or bytes. Optionally filter to a single channel by id. Requires the files:read scope.",
  category: "files",
  activation: "webhook",
  requiresIntegration: true,
  fields: [
    {
      name: "channelId",
      sensitivity: "recipient",
      label: "Channel (optional)",
      description:
        "When set, only file shares in this channel fire the workflow. When blank, every file_shared event matches. Public and private channels are both supported.",
      type: "combobox",
      optionsSource: "slack:channels",
      allowManualEntry: true,
      required: false,
      placeholder: "Search channels or paste a channel ID",
    },
  ],
  payloadShape: [
    { name: "type", type: "string", description: "Slack event type — 'file_shared'." },
    { name: "file_id", type: "string", description: "Slack file id. Use with slack:get_file_info to fetch metadata." },
    { name: "user_id", type: "string", description: "User id of the person who shared the file." },
    { name: "channel_id", type: "string", description: "Channel id where the file was shared (snake_case `_id` suffix — Slack's payload shape)." },
    { name: "file", type: "object", description: "Partial file stub — { id }. Only the id is reliable; full metadata requires slack:get_file_info." },
    { name: "event_ts", type: "string", description: "Slack event timestamp." },
  ],
  displayOrder: 100,
};
