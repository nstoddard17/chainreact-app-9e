import { NodeComponent } from "../../../types"

const SLACK_ARCHIVE_CHANNEL_METADATA = {
  key: "slack_action_archive_channel",
  name: "Archive Channel",
  description: "Archive a Slack channel"
}

export const archiveChannelActionSchema: NodeComponent = {
  type: SLACK_ARCHIVE_CHANNEL_METADATA.key,
  title: SLACK_ARCHIVE_CHANNEL_METADATA.name,
  description: SLACK_ARCHIVE_CHANNEL_METADATA.description,
  icon: "Archive" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["channels:write", "groups:write"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "channel",
      label: "Channel",
      type: "combobox",
      required: true,
      dynamic: "slack-channels",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a channel to archive",
      tooltip: "Select the channel to archive. Works with both public and private channels (if bot has permissions). Archived channels can be unarchived later."
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the channel was archived successfully"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the archived channel",
      example: "C1234567890"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the archived channel",
      example: "old-project"
    },
    {
      name: "archivedAt",
      label: "Archived At",
      type: "string",
      description: "Timestamp when the channel was archived",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
