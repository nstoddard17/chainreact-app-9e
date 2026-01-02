import { NodeComponent } from "../../../types"

const SLACK_GET_CHANNEL_INFO_METADATA = {
  key: "slack_action_get_channel_info",
  name: "Get Channel Info",
  description: "Get detailed information about a Slack channel"
}

export const getChannelInfoActionSchema: NodeComponent = {
  type: SLACK_GET_CHANNEL_INFO_METADATA.key,
  title: SLACK_GET_CHANNEL_INFO_METADATA.name,
  description: SLACK_GET_CHANNEL_INFO_METADATA.description,
  icon: "Info" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["channels:read", "groups:read"],
  category: "Communication",
  isTrigger: false,
  testable: true,
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
      required: false,
      dynamic: "slack_channels",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a channel",
      tooltip: "Select the channel to get information about. Works with both public and private channels (if bot has permissions).",
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
      name: "found",
      label: "Found",
      type: "boolean",
      description: "Whether a matching channel was found (true for select method, may be false for name/ID search)",
      example: true
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The unique ID of the channel",
      example: "C1234567890"
    },
    {
      name: "name",
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
      name: "isArchived",
      label: "Is Archived",
      type: "boolean",
      description: "Whether the channel is archived",
      example: false
    },
    {
      name: "isGeneral",
      label: "Is General Channel",
      type: "boolean",
      description: "Whether this is the #general channel",
      example: true
    },
    {
      name: "creator",
      label: "Creator User ID",
      type: "string",
      description: "The ID of the user who created the channel",
      example: "U1234567890"
    },
    {
      name: "createdAt",
      label: "Created At",
      type: "string",
      description: "When the channel was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "topic",
      label: "Channel Topic",
      type: "string",
      description: "The channel's topic/description",
      example: "General discussion"
    },
    {
      name: "purpose",
      label: "Channel Purpose",
      type: "string",
      description: "The channel's stated purpose",
      example: "Company-wide announcements"
    },
    {
      name: "numMembers",
      label: "Number of Members",
      type: "number",
      description: "Total number of members in the channel",
      example: 42
    },
    {
      name: "previousNames",
      label: "Previous Names",
      type: "array",
      description: "Array of previous channel names",
      example: ["old-name", "another-name"]
    },
    {
      name: "isShared",
      label: "Is Shared",
      type: "boolean",
      description: "Whether the channel is shared with another workspace",
      example: false
    },
    {
      name: "isOrgShared",
      label: "Is Org Shared",
      type: "boolean",
      description: "Whether the channel is shared across an Enterprise Grid organization",
      example: false
    },
    {
      name: "isExtShared",
      label: "Is Externally Shared",
      type: "boolean",
      description: "Whether the channel is shared with external organizations",
      example: false
    }
  ]
}
