import { NodeComponent } from "../../../types"

const SLACK_PIN_MESSAGE_METADATA = {
  key: "slack_action_pin_message",
  name: "Pin Message",
  description: "Pin a message to a Slack channel"
}

export const pinMessageActionSchema: NodeComponent = {
  type: SLACK_PIN_MESSAGE_METADATA.key,
  title: "Pin Message",
  description: SLACK_PIN_MESSAGE_METADATA.description,
  icon: "Pin" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["pins:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "pinned",
      label: "Pinned",
      type: "boolean",
      description: "Whether the message was successfully pinned",
      example: true
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message was pinned",
      example: "C1234567890"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "The timestamp of the pinned message",
      example: "1234567890.123456"
    },
    {
      name: "pinnedBy",
      label: "Pinned By",
      type: "string",
      description: "User ID who pinned the message",
      example: "U1234567890"
    },
    {
      name: "pinnedAt",
      label: "Pinned At",
      type: "string",
      description: "When the message was pinned",
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
    {
      name: "channel",
      label: "Channel",
      type: "select",
      dynamic: "slack_channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select a channel...",
      description: "The channel containing the message to pin",
      tooltip: "The bot must be a member of this channel to pin messages."
    },
    {
      name: "messageId",
      label: "Message Timestamp",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}} or 1234567890.123456",
      supportsAI: true,
      description: "The timestamp of the message to pin",
      tooltip: "This is the 'ts' value from Slack (e.g., 1234567890.123456). Get this from a trigger or the 'Send Message' action output. Channels can have a maximum of 100 pinned items.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    }
  ]
}
