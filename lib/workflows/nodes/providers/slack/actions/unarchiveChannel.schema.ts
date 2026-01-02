import { NodeComponent } from "../../../types"

const SLACK_UNARCHIVE_CHANNEL_METADATA = {
  key: "slack_action_unarchive_channel",
  name: "Unarchive Channel",
  description: "Unarchive a Slack channel"
}

export const unarchiveChannelActionSchema: NodeComponent = {
  type: SLACK_UNARCHIVE_CHANNEL_METADATA.key,
  title: SLACK_UNARCHIVE_CHANNEL_METADATA.name,
  description: SLACK_UNARCHIVE_CHANNEL_METADATA.description,
  icon: "ArchiveRestore" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["channels:write", "groups:write"],
  category: "Communication",
  isTrigger: false,
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
      type: "combobox",
      required: true,
      dynamic: "slack_channels_archived",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select an archived channel",
      tooltip: "Select the archived channel to restore. The channel will become active again and members can post messages. Note: You may need to manually provide the channel ID if it doesn't appear in the list.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "channelId",
      label: "Or Enter Channel ID",
      type: "text",
      required: false,
      placeholder: "C1234567890",
      tooltip: "Alternative: Directly enter the channel ID if you have it. This is useful if the channel doesn't appear in the dropdown.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the channel was unarchived successfully"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the unarchived channel",
      example: "C1234567890"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the unarchived channel",
      example: "old-project"
    },
    {
      name: "unarchivedAt",
      label: "Unarchived At",
      type: "string",
      description: "Timestamp when the channel was unarchived",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
