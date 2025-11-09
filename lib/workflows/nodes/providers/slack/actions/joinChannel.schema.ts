import { NodeComponent } from "../../../types"

const SLACK_JOIN_CHANNEL_METADATA = {
  key: "slack_action_join_channel",
  name: "Join Channel",
  description: "Join a Slack channel (bot joins)"
}

export const joinChannelActionSchema: NodeComponent = {
  type: SLACK_JOIN_CHANNEL_METADATA.key,
  title: SLACK_JOIN_CHANNEL_METADATA.name,
  description: SLACK_JOIN_CHANNEL_METADATA.description,
  icon: "LogIn" as any, // Will be resolved in index file
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
      dynamic: "slack-channels-public",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a channel to join",
      tooltip: "Select the public channel for the bot to join. Once joined, the bot can send messages and receive events from this channel. Note: Private channels require an invitation."
    },
    {
      name: "channelId",
      label: "Or Enter Channel ID",
      type: "text",
      required: false,
      placeholder: "C1234567890",
      tooltip: "Alternative: Directly enter the channel ID if you have it. Useful for joining channels that don't appear in the dropdown."
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the bot joined the channel successfully"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel the bot joined",
      example: "C1234567890"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel",
      example: "general"
    },
    {
      name: "isPrivate",
      label: "Is Private",
      type: "boolean",
      description: "Whether the channel is private",
      example: false
    },
    {
      name: "joinedAt",
      label: "Joined At",
      type: "string",
      description: "Timestamp when the bot joined the channel",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
