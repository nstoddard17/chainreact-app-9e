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
      placeholder: "Select a channel",
      tooltip: "Select the Slack channel where you want to send the message. Private channels require the bot to be invited first. You can also use variables to dynamically set the channel."
    },
    {
      name: "message",
      label: "Message",
      type: "rich-text",
      required: true,
      placeholder: "Type your message...",
      defaultValue: "",
      tooltip: "The message content with rich text formatting (bold, italic, links, etc.). You can drag variables from the right panel to include dynamic content from previous workflow steps."
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file-with-toggle",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 50 * 1024 * 1024, // 50MB limit
      multiple: true, // Allow multiple file attachments
      tooltip: "Attach files to your message (max 50MB per file). Files under 10MB are processed instantly. Files 10-25MB may take a few seconds. Files over 25MB may experience slower processing. Upload: Choose files from your computer. URL: Provide direct links to files. Variables: Drag from the variable panel or type {{node_id}} to attach files from previous workflow steps.",
      toggleOptions: {
        modes: ["upload", "url"],
        labels: {
          upload: "Upload",
          url: "URL"
        },
        placeholders: {
          url: "https://example.com/document.pdf"
        },
        defaultMode: "upload"
      }
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, @mentions and #channel references in your message will become clickable links. For example, @username becomes a link to that user's profile. Useful for notifications."
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, Slack will automatically show rich previews for URLs in your message (website titles, descriptions, and images). Disable for cleaner, text-only messages."
    },
    {
      name: "asUser",
      label: "Send as User",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, sends the message as YOU (the actual user) instead of the bot. This only works if you granted user permissions during Slack connection. When disabled, the message is sent as the bot and can be customized with username and icon fields below."
    },
    {
      name: "username",
      label: "Bot Username (Optional)",
      type: "text",
      placeholder: "Custom bot username",
      tooltip: "Override the bot's display name for this message only. Works with bot token (when 'Send as User' is OFF). May be ignored if workspace has 'Lock bot name & icon' enabled in Slack admin settings. Leave empty to use default bot name.",
      showWhen: {
        "asUser": { "$eq": false }
      }
    },
    {
      name: "icon",
      label: "Bot Icon (Optional)",
      type: "file-with-toggle",
      accept: ".jpg,.jpeg,.png,.gif,.webp",
      maxSize: 5 * 1024 * 1024, // 5MB limit for icons
      tooltip: "Override the bot's icon for this message only. Works with bot token (when 'Send as User' is OFF). Upload an image or provide a URL to an image. May be ignored if workspace has 'Lock bot name & icon' enabled.",
      placeholder: "Choose an icon file",
      toggleOptions: {
        modes: ["upload", "url"],
        labels: {
          upload: "Upload",
          url: "URL"
        },
        placeholders: {
          url: "https://example.com/icon.png or :emoji:"
        },
        defaultMode: "upload"
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