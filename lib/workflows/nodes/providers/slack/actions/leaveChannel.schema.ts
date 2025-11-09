import { NodeComponent } from "../../../types"

const SLACK_LEAVE_CHANNEL_METADATA = {
  key: "slack_action_leave_channel",
  name: "Leave Channel",
  description: "Leave a Slack channel (bot or user exits)"
}

export const leaveChannelActionSchema: NodeComponent = {
  type: SLACK_LEAVE_CHANNEL_METADATA.key,
  title: SLACK_LEAVE_CHANNEL_METADATA.name,
  description: SLACK_LEAVE_CHANNEL_METADATA.description,
  icon: "LogOut" as any, // Will be resolved in index file
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
      placeholder: "Select a channel to leave",
      tooltip: "Select the channel for the bot to leave. The bot will no longer receive messages or have access to this channel. Works with both public and private channels."
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the bot left the channel successfully"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel the bot left",
      example: "C1234567890"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel",
      example: "old-project"
    },
    {
      name: "leftAt",
      label: "Left At",
      type: "string",
      description: "Timestamp when the bot left the channel",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
