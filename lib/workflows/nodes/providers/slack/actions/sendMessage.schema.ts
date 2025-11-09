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
    // Parent field - always visible
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

    // Cascaded fields - only show after channel selected
    {
      name: "message",
      label: "Message",
      type: "rich-text",
      required: true,
      placeholder: "Type your message...",
      defaultValue: "",
      tooltip: "The message content with rich text formatting (bold, italic, links, etc.). You can drag variables from the right panel to include dynamic content from previous workflow steps.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "attachments",
      label: "File Attachments (Optional)",
      type: "file-with-toggle",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 50 * 1024 * 1024, // 50MB limit
      multiple: true, // Allow multiple file attachments
      tooltip: "Attach files to your message (max 50MB per file). Upload: Choose files from your computer. URL: Provide direct links to files. Variables: Use merge fields to attach files from previous steps.",
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
      },
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "threadTimestamp",
      label: "Reply in Thread (Optional)",
      type: "text",
      required: false,
      placeholder: "{{trigger.ts}}",
      supportsAI: true,
      tooltip: "Reply to a specific message thread by providing the parent message's timestamp. Use merge fields like {{trigger.ts}} or {{previous_node.ts}}. Leave empty to send as a new message.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "blocks",
      label: "Custom Block Kit (Advanced)",
      type: "object",
      required: false,
      placeholder: JSON.stringify([{ type: "section", text: { type: "mrkdwn", text: "Your message here" } }], null, 2),
      supportsAI: true,
      tooltip: "Use Slack Block Kit for advanced message formatting with buttons, images, and interactive elements. Design your blocks at https://app.slack.com/block-kit-builder. When blocks are provided, they override the simple message field.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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