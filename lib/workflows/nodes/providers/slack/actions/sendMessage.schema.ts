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
      loadOnMount: true,
      tooltip: "Select the Slack channel where you want to send the message"
    },
    {
      name: "message",
      label: "Message",
      type: "rich-text",
      required: true,
      placeholder: "Type your message...",
      tooltip: "The message content with rich text formatting (bold, italic, links, etc.)"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file-with-toggle",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 25 * 1024 * 1024, // 25MB limit
      tooltip: "Attach files from your computer, provide URLs, use emojis, or select from previous workflow nodes",
      toggleOptions: {
        modes: ["upload", "url", "emoji"],
        labels: {
          upload: "Upload",
          url: "URL",
          emoji: "Emoji"
        },
        placeholders: {
          url: "https://example.com/document.pdf",
          emoji: ":file_folder:"
        },
        defaultMode: "upload"
      }
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      defaultValue: false,
      tooltip: "Automatically converts @mentions and #channels to clickable links"
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: true,
      tooltip: "Slack will automatically expand links to show previews"
    },
    {
      name: "asUser",
      label: "Send as User",
      type: "boolean",
      defaultValue: true,
      tooltip: "Message will appear from the authenticated user instead of the bot"
    },
    {
      name: "username",
      label: "Username Override",
      type: "text",
      placeholder: "Custom bot username",
      tooltip: "Override the default bot username (only works when 'Send as User' is off)",
      showWhen: {
        "asUser": { "$eq": false }
      }
    },
    {
      name: "icon",
      label: "Bot Icon",
      type: "file-with-toggle",
      accept: ".jpg,.jpeg,.png,.gif,.webp",
      maxSize: 5 * 1024 * 1024, // 5MB limit for icons
      tooltip: "Set a custom icon for the bot message using an image file, URL, or emoji",
      placeholder: "Choose an icon file",
      toggleOptions: {
        modes: ["upload", "url", "emoji"],
        labels: {
          upload: "Upload",
          url: "URL",
          emoji: "Emoji"
        },
        placeholders: {
          url: "https://example.com/icon.png",
          emoji: ":smile:"
        },
        defaultMode: "emoji"
      },
      showWhen: {
        "asUser": { "$eq": false }
      }
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