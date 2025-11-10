import { NodeComponent } from "../../../types"

const SLACK_GET_MESSAGES_METADATA = {
  key: "slack_action_get_messages",
  name: "Get Messages",
  description: "Retrieve messages from a Slack channel with optional filtering"
}

export const getMessagesActionSchema: NodeComponent = {
  type: SLACK_GET_MESSAGES_METADATA.key,
  title: SLACK_GET_MESSAGES_METADATA.name,
  description: SLACK_GET_MESSAGES_METADATA.description,
  icon: "MessageCircle" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["channels:history", "groups:history"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "channel",
      label: "Channel",
      type: "select",
      required: true,
      dynamic: "slack_channels",
      loadOnMount: true,
      placeholder: "Select a channel",
      tooltip: "Select the Slack channel to retrieve messages from"
    },
    {
      name: "limit",
      label: "Maximum Messages",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "Number of messages to retrieve (max 1000)",
      tooltip: "Maximum number of messages to retrieve (default: 100, max: 1000)",
      supportsAI: true,
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "oldest",
      label: "From Date (Optional)",
      type: "datetime",
      required: false,
      placeholder: "Only messages after this date",
      tooltip: "Only include messages posted after this date and time",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "latest",
      label: "To Date (Optional)",
      type: "datetime",
      required: false,
      placeholder: "Only messages before this date",
      tooltip: "Only include messages posted before this date and time",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "includeThreads",
      label: "Include Thread Replies",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, includes replies from conversation threads",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "messages",
      label: "Messages",
      type: "array",
      description: "Array of messages from the channel"
    },
    {
      name: "count",
      label: "Count",
      type: "number",
      description: "Number of messages retrieved"
    },
    {
      name: "hasMore",
      label: "Has More",
      type: "boolean",
      description: "Whether there are more messages available"
    }
  ]
}
