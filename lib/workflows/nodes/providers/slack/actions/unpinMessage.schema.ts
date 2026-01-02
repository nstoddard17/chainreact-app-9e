import { NodeComponent } from "../../../types"

const SLACK_UNPIN_MESSAGE_METADATA = {
  key: "slack_action_unpin_message",
  name: "Unpin Message",
  description: "Unpin a message from a Slack channel"
}

export const unpinMessageActionSchema: NodeComponent = {
  type: SLACK_UNPIN_MESSAGE_METADATA.key,
  title: "Unpin Message",
  description: SLACK_UNPIN_MESSAGE_METADATA.description,
  icon: "PinOff" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["pins:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "unpinned",
      label: "Unpinned",
      type: "boolean",
      description: "Whether the message was successfully unpinned",
      example: true
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message was unpinned",
      example: "C1234567890"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "The timestamp of the unpinned message",
      example: "1234567890.123456"
    },
    {
      name: "unpinnedBy",
      label: "Unpinned By",
      type: "string",
      description: "User ID who unpinned the message",
      example: "U1234567890"
    },
    {
      name: "unpinnedAt",
      label: "Unpinned At",
      type: "string",
      description: "When the message was unpinned",
      example: "2024-01-15T10:30:00Z"
    }
  ],
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
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack_channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a channel...",
      description: "The channel containing the message to unpin",
      tooltip: "The bot must be a member of this channel to unpin messages.",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "messageId",
      label: "Message Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}} or paste message URL",
      supportsAI: true,
      description: "The timestamp of the message to unpin",
      tooltip: "Paste the full Slack message URL (e.g., https://workspace.slack.com/archives/C123/p1767325385562299) or just the timestamp (1767325385.562299). Right-click any message in Slack and select 'Copy link' to get the URL. You can also use variables like {{trigger.messageId}}. The message must currently be pinned.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ]
}
