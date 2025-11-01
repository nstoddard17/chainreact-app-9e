import { NodeComponent } from "../../../types"

const SLACK_GET_THREAD_MESSAGES_METADATA = {
  key: "slack_action_get_thread_messages",
  name: "Get Thread Messages",
  description: "Retrieve all replies in a message thread"
}

export const getThreadMessagesActionSchema: NodeComponent = {
  type: SLACK_GET_THREAD_MESSAGES_METADATA.key,
  title: "Get Thread Messages",
  description: SLACK_GET_THREAD_MESSAGES_METADATA.description,
  icon: "MessageCircle" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["channels:history", "groups:history", "im:history", "mpim:history"],
  category: "Communication",
  outputSchema: [
    {
      name: "messages",
      label: "Thread Messages",
      type: "array",
      description: "Array of all messages in the thread",
      example: [
        {
          text: "Parent message",
          user: "U1234567890",
          timestamp: "1234567890.123456",
          threadTs: "1234567890.123456"
        }
      ]
    },
    {
      name: "messageCount",
      label: "Message Count",
      type: "number",
      description: "Total number of messages in the thread (including parent)",
      example: 5
    },
    {
      name: "replyCount",
      label: "Reply Count",
      type: "number",
      description: "Number of replies (excluding parent message)",
      example: 4
    },
    {
      name: "parentMessage",
      label: "Parent Message",
      type: "object",
      description: "The original message that started the thread",
      example: {
        text: "Parent message",
        user: "U1234567890",
        timestamp: "1234567890.123456"
      }
    },
    {
      name: "replies",
      label: "Replies",
      type: "array",
      description: "Array of reply messages (excluding parent)",
      example: [
        {
          text: "Reply message",
          user: "U0987654321",
          timestamp: "1234567890.123457"
        }
      ]
    },
    {
      name: "participants",
      label: "Participants",
      type: "array",
      description: "Array of unique user IDs who participated in the thread",
      example: ["U1234567890", "U0987654321"]
    }
  ],
  configSchema: [
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      dynamic: "slack-workspaces",
      required: true,
      loadOnMount: true,
      placeholder: "Select Slack workspace",
      description: "Your Slack workspace (used for authentication)"
    },
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack-channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a channel...",
      description: "The channel containing the thread",
      tooltip: "The bot must be a member of this channel to read thread messages."
    },
    {
      name: "threadTs",
      label: "Thread Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.threadTs}} or 1234567890.123456",
      supportsAI: true,
      description: "The timestamp of the parent message that started the thread",
      tooltip: "This is the 'thread_ts' or 'ts' value from the parent message. Get this from triggers or message actions. Format: 1234567890.123456"
    },
    {
      name: "maxResults",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      min: 1,
      max: 1000,
      placeholder: "100",
      description: "Maximum number of messages to retrieve (Slack limit is 1000)",
      tooltip: "Set a lower number for better performance if you only need recent replies."
    },
    {
      name: "includeParent",
      label: "Include Parent Message",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Include the parent message in the results",
      tooltip: "When enabled, the first message in the results will be the parent message that started the thread."
    },
    {
      name: "oldestFirst",
      label: "Oldest First",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Return messages in chronological order (oldest first)",
      tooltip: "When enabled, messages are ordered from oldest to newest. Disable to get newest messages first."
    }
  ]
}
