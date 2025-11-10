import { NodeComponent } from "../../../types"

const SLACK_LIST_CHANNELS_METADATA = {
  key: "slack_action_list_channels",
  name: "List Channels",
  description: "Get a list of all channels in the workspace"
}

export const listChannelsActionSchema: NodeComponent = {
  type: SLACK_LIST_CHANNELS_METADATA.key,
  title: SLACK_LIST_CHANNELS_METADATA.name,
  description: SLACK_LIST_CHANNELS_METADATA.description,
  icon: "List" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["channels:read", "groups:read"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
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
    {
      name: "includePrivate",
      label: "Include Private Channels",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, includes private channels the bot has access to in the results.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "excludeArchived",
      label: "Exclude Archived Channels",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, excludes archived channels from the results. Disable to include all channels.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "limit",
      label: "Limit Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      tooltip: "Maximum number of channels to return (1-1000). Default is 100. Use 0 for no limit (returns all channels).",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "sortBy",
      label: "Sort By",
      type: "select",
      required: false,
      defaultValue: "name",
      options: [
        { label: "Name (A-Z)", value: "name" },
        { label: "Created Date (Newest first)", value: "created_desc" },
        { label: "Created Date (Oldest first)", value: "created_asc" },
        { label: "Member Count (Highest first)", value: "members_desc" }
      ],
      tooltip: "How to sort the channel list.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "channels",
      label: "Channels",
      type: "array",
      description: "Array of channel objects",
      example: []
    },
    {
      name: "totalCount",
      label: "Total Count",
      type: "number",
      description: "Total number of channels returned",
      example: 42
    },
    {
      name: "publicCount",
      label: "Public Channels Count",
      type: "number",
      description: "Number of public channels",
      example: 35
    },
    {
      name: "privateCount",
      label: "Private Channels Count",
      type: "number",
      description: "Number of private channels",
      example: 7
    },
    {
      name: "archivedCount",
      label: "Archived Count",
      type: "number",
      description: "Number of archived channels (if included)",
      example: 5
    }
  ]
}
