import { NodeComponent } from "../../../types"

const SLACK_SEND_MESSAGE_METADATA = {
  key: "slack_action_send_message",
  name: "Send Message",
  description: "Send a message to a channel"
}

export const sendMessageActionSchema: NodeComponent = {
  type: SLACK_SEND_MESSAGE_METADATA.key,
  title: SLACK_SEND_MESSAGE_METADATA.name,
  description: SLACK_SEND_MESSAGE_METADATA.description,
  icon: "MessageSquare" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["chat:write"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "channel",
      label: "Channel",
      type: "select",
      required: true,
      dynamic: "slack-channels",
      description: "Select the Slack channel where you want to send the message"
    },
    {
      name: "message",
      label: "Message",
      type: "rich-text",
      required: true,
      placeholder: "Type your message...",
      description: "The message content with rich text formatting (bold, italic, links, etc.)"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 25 * 1024 * 1024, // 25MB limit
      description: "Attach files from your computer or select files from previous workflow nodes"
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      defaultValue: false,
      description: "When enabled, automatically converts @mentions and #channels to clickable links"
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: true,
      description: "When enabled, Slack will automatically expand links to show previews"
    },
    {
      name: "username",
      label: "Username Override",
      type: "text",
      placeholder: "Optional: Override bot username",
      description: "Override the default bot username that appears with the message"
    },
    {
      name: "iconUrl",
      label: "Icon",
      type: "custom",
      placeholder: "URL to custom icon or upload image file",
      description: "Set a custom icon for the message. You can provide a URL or upload an image file"
    },
    {
      name: "asUser",
      label: "As User",
      type: "boolean",
      defaultValue: false,
      description: "When enabled, the message will appear to be sent by the authenticated user instead of the bot"
    }
  ],
  outputSchema: [
    {
      name: "ts",
      label: "Message Timestamp",
      type: "string",
      description: "The timestamp of the sent message"
    },
    {
      name: "channel",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the message was sent"
    },
    {
      name: "message",
      label: "Message Object",
      type: "object",
      description: "The complete message object returned by Slack"
    }
  ]
}