import { NodeComponent } from "../../../types"

const SLACK_FIND_CHANNEL_METADATA = {
  key: "slack_action_find_channel",
  name: "Find Channel",
  description: "Find a Slack channel by name or ID"
}

export const findChannelActionSchema: NodeComponent = {
  type: SLACK_FIND_CHANNEL_METADATA.key,
  title: SLACK_FIND_CHANNEL_METADATA.name,
  description: SLACK_FIND_CHANNEL_METADATA.description,
  icon: "SearchCode" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["channels:read", "groups:read"],
  category: "Communication",
  isTrigger: false,
  testable: true,
  configSchema: [
    {
      name: "searchBy",
      label: "Search By",
      type: "select",
      required: true,
      options: [
        { value: "name", label: "Channel Name" },
        { value: "id", label: "Channel ID" }
      ],
      defaultValue: "name",
      description: "Search by channel name or ID",
      tooltip: "Choose whether to search by the channel's name (e.g., 'general') or its unique ID (e.g., 'C1234567890')."
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "text",
      required: true,
      placeholder: "general",
      supportsAI: true,
      description: "The name of the channel to find (without #)",
      tooltip: "Enter the channel name without the # symbol. The search will find exact matches or close matches.",
      visibleWhen: {
        field: "searchBy",
        value: "name"
      }
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "text",
      required: true,
      placeholder: "C1234567890",
      supportsAI: true,
      description: "The ID of the channel to find",
      tooltip: "Enter the channel ID (starts with C). Channel IDs are returned by other Slack actions and triggers.",
      visibleWhen: {
        field: "searchBy",
        value: "id"
      }
    },
    {
      name: "includeArchived",
      label: "Include Archived Channels",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, the search will also include archived channels."
    },
    {
      name: "includePrivate",
      label: "Include Private Channels",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, searches both public and private channels the bot has access to. When disabled, only public channels."
    }
  ],
  outputSchema: [
    {
      name: "found",
      label: "Found",
      type: "boolean",
      description: "Whether a matching channel was found",
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
      name: "topic",
      label: "Channel Topic",
      type: "string",
      description: "The channel's topic",
      example: "General discussion"
    },
    {
      name: "purpose",
      label: "Channel Purpose",
      type: "string",
      description: "The channel's purpose",
      example: "Company-wide announcements"
    },
    {
      name: "numMembers",
      label: "Number of Members",
      type: "number",
      description: "Total number of members",
      example: 42
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
    }
  ]
}
