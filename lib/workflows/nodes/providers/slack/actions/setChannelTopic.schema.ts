import { NodeComponent } from "../../../types"

const SLACK_SET_CHANNEL_TOPIC_METADATA = {
  key: "slack_action_set_channel_topic",
  name: "Set Channel Topic",
  description: "Set or update the topic for a Slack channel"
}

export const setChannelTopicActionSchema: NodeComponent = {
  type: SLACK_SET_CHANNEL_TOPIC_METADATA.key,
  title: "Set Channel Topic",
  description: SLACK_SET_CHANNEL_TOPIC_METADATA.description,
  icon: "FileText" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["channels:write", "groups:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel that was updated",
      example: "C1234567890"
    },
    {
      name: "topic",
      label: "Topic",
      type: "string",
      description: "The new channel topic",
      example: "Weekly team sync - Mondays at 10am"
    },
    {
      name: "updatedBy",
      label: "Updated By",
      type: "string",
      description: "User ID who set the topic",
      example: "U1234567890"
    },
    {
      name: "updatedAt",
      label: "Updated At",
      type: "string",
      description: "When the topic was updated",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the topic was set successfully",
      example: true
    }
  ],
  configSchema: [
    // Parent field - always visible
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      dynamic: "slack_workspaces",
      required: true,
      loadOnMount: true,
      placeholder: "Select Slack workspace",
      description: "Your Slack workspace (used for authentication)"
    },
    // Option to use user token instead of bot token
    {
      name: "asUser",
      label: "Execute as User",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Execute this action as yourself instead of the Chain React bot. Requires reconnecting Slack with user permissions.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    // First cascade level - show after workspace selected
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack_channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a channel...",
      description: "The channel to update",
      tooltip: "You must have permission to manage this channel. Private channels require the bot to be a member.",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    // Second cascade level - show after channel selected
    {
      name: "topic",
      label: "Topic",
      type: "textarea",
      required: true,
      rows: 4,
      maxLength: 250,
      placeholder: "Weekly team sync - Mondays at 10am",
      supportsAI: true,
      description: "The new topic for the channel (max 250 characters)",
      tooltip: "Channel topics appear at the top of the channel and help members understand what the channel is for. Keep it concise and informative.",
      dependsOn: "channel",
      hidden: { $deps: ["channel"], $condition: { channel: { $exists: false } } }
    }
  ]
}
