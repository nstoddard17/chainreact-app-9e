import { NodeComponent } from "../../../types"

const SLACK_REMOVE_USER_METADATA = {
  key: "slack_action_remove_user_from_channel",
  name: "Remove User from Channel",
  description: "Remove a user from a channel (kick)"
}

export const removeUserFromChannelActionSchema: NodeComponent = {
  type: SLACK_REMOVE_USER_METADATA.key,
  title: SLACK_REMOVE_USER_METADATA.name,
  description: SLACK_REMOVE_USER_METADATA.description,
  icon: "UserMinus" as any, // Will be resolved in index file
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
    // First cascade level - show after workspace selected
    {
      name: "channel",
      label: "Channel",
      type: "combobox",
      required: true,
      dynamic: "slack_channels",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a channel",
      tooltip: "Select the channel to remove the user from. Works with both public and private channels (if bot has permissions).",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    // Second cascade level - show after channel selected
    {
      name: "user",
      label: "User",
      type: "combobox",
      required: true,
      dynamic: "slack_users",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a user to remove",
      tooltip: "Select the user to remove from the channel. You can search by name or email.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the user was removed successfully"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel the user was removed from",
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
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user who was removed",
      example: "U1234567890"
    },
    {
      name: "userName",
      label: "User Name",
      type: "string",
      description: "The display name of the removed user",
      example: "John Doe"
    },
    {
      name: "removedAt",
      label: "Removed At",
      type: "string",
      description: "Timestamp when the user was removed",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
