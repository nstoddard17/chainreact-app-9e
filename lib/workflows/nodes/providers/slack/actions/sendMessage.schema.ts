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
      maxSize: 25 * 1024 * 1024, // 25MB limit
      tooltip: "Attach files to your message. Upload: Choose files from your computer. URL: Provide direct links to files. To use variables: Drag and drop from the variable panel on the right, or type {{node_id.output}} format. Variables let you attach files from previous workflow steps dynamically.",
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
      defaultValue: true,
      tooltip: "When enabled, the message appears as if sent by you (the authenticated user). When disabled, it appears from the Slack app/bot. Note: Bot customization options only work when this is disabled."
    },
    {
      name: "username",
      label: "Username Override",
      type: "text",
      placeholder: "Custom bot username",
      tooltip: "Set a custom username for the bot (only visible when 'Send as User' is disabled). Leave empty to use the default bot name. You can use variables to dynamically set the username.",
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
      tooltip: "Set a custom icon for bot messages (only works when 'Send as User' is off). Upload: Choose an image file. URL: Provide a direct image link. To use variables: Drag from the variable panel or type {{node_id.output}} to dynamically set icons from previous workflow steps.",
      placeholder: "Choose an icon file",
      toggleOptions: {
        modes: ["upload", "url"],
        labels: {
          upload: "Upload",
          url: "URL"
        },
        placeholders: {
          url: "https://example.com/icon.png"
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