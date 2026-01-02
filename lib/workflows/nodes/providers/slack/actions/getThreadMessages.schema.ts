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
    {
      name: "asUser",
      label: "Execute as User",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Execute this action as yourself instead of the Chain React bot. Required for private channels or threads the bot doesn't have access to. Requires reconnecting Slack with user permissions.",
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
      description: "The channel containing the thread",
      tooltip: "The bot must be a member of this channel to read thread messages.",
      hidden: { $deps: ["workspace"], $condition: { workspace: { $exists: false } } }
    },
    // Second cascade level - show after channel selected
    {
      name: "threadTs",
      label: "Thread Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.threadTs}} or 1234567890.123456 or Slack URL",
      supportsAI: true,
      description: "The timestamp of the parent message that started the thread",
      tooltip: "Accepts: Slack message URL (https://slack.com/archives/C123/p1234567890123456), timestamp (1234567890.123456), or URL format (p1234567890123456). Get this from triggers or message actions.",
      dependsOn: "channel",
      hidden: { $deps: ["channel"], $condition: { channel: { $exists: false } } }
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
      tooltip: "Set a lower number for better performance if you only need recent replies.",
      dependsOn: "channel",
      hidden: { $deps: ["channel"], $condition: { channel: { $exists: false } } }
    }
  ]
}
