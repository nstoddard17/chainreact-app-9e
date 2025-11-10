import { NodeComponent } from "../../../types"

const SLACK_RENAME_CHANNEL_METADATA = {
  key: "slack_action_rename_channel",
  name: "Rename Channel",
  description: "Rename a Slack channel"
}

export const renameChannelActionSchema: NodeComponent = {
  type: SLACK_RENAME_CHANNEL_METADATA.key,
  title: SLACK_RENAME_CHANNEL_METADATA.name,
  description: SLACK_RENAME_CHANNEL_METADATA.description,
  icon: "PencilLine" as any, // Will be resolved in index file
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
      tooltip: "Select the channel to rename. Works with both public and private channels (if bot has permissions).",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    // Second cascade level - show after channel selected
    {
      name: "newName",
      label: "New Channel Name",
      type: "text",
      required: true,
      placeholder: "new-channel-name",
      supportsAI: true,
      tooltip: "The new name for the channel. Must be lowercase, without spaces or periods, and may contain underscores or hyphens. Maximum 80 characters.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "validate",
      label: "Validate Name Format",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, validates the channel name format before attempting to rename (lowercase, no spaces, max 80 chars).",
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
      description: "Whether the channel was renamed successfully"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the renamed channel",
      example: "C1234567890"
    },
    {
      name: "oldName",
      label: "Old Channel Name",
      type: "string",
      description: "The previous name of the channel",
      example: "old-project"
    },
    {
      name: "newName",
      label: "New Channel Name",
      type: "string",
      description: "The new name of the channel",
      example: "new-project"
    },
    {
      name: "renamedAt",
      label: "Renamed At",
      type: "string",
      description: "Timestamp when the channel was renamed",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
