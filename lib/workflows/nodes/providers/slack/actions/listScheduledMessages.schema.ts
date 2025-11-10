import { NodeComponent } from "../../../types"

const SLACK_LIST_SCHEDULED_MESSAGES_METADATA = {
  key: "slack_action_list_scheduled_messages",
  name: "List Scheduled Messages",
  description: "Get a list of all scheduled messages"
}

export const listScheduledMessagesActionSchema: NodeComponent = {
  type: SLACK_LIST_SCHEDULED_MESSAGES_METADATA.key,
  title: SLACK_LIST_SCHEDULED_MESSAGES_METADATA.name,
  description: SLACK_LIST_SCHEDULED_MESSAGES_METADATA.description,
  icon: "CalendarClock" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["chat:write"],
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
      name: "channel",
      label: "Channel (Optional)",
      type: "select",
      required: false,
      dynamic: "slack_channels",
      placeholder: "All channels",
      description: "Filter by channel (optional)",
      tooltip: "Optional: Filter scheduled messages for a specific channel. Leave empty to see all scheduled messages.",
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
      tooltip: "Maximum number of scheduled messages to return (1-1000). Default is 100.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "oldest",
      label: "Oldest Timestamp (Unix)",
      type: "number",
      required: false,
      placeholder: "1609459200",
      tooltip: "Optional: Only show messages scheduled after this Unix timestamp",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "latest",
      label: "Latest Timestamp (Unix)",
      type: "number",
      required: false,
      placeholder: "1699891200",
      tooltip: "Optional: Only show messages scheduled before this Unix timestamp",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "scheduledMessages",
      label: "Scheduled Messages",
      type: "array",
      description: "Array of scheduled message objects",
      example: []
    },
    {
      name: "totalCount",
      label: "Total Count",
      type: "number",
      description: "Total number of scheduled messages returned",
      example: 5
    }
  ]
}
