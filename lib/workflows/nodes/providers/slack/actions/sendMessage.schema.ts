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
      required: true,
      dynamic: "slack_channels",
      placeholder: "Select a channel...",
      description: "Choose which Slack channel to send the message to",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "sendAsUser",
      label: "Send as User",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Send the message as yourself instead of the Chain React bot. Requires reconnecting Slack with user permissions.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "message",
      label: "Message",
      type: "slack-rich-text",
      required: true,
      placeholder: "Type your message...",
      defaultValue: "",
      description: "Message content with rich text formatting (bold, italic, links, etc.)"
    },
    {
      name: "threadTimestamp",
      label: "Thread (Optional)",
      type: "text",
      required: false,
      placeholder: "{{trigger.ts}}",
      supportsAI: true,
      description: "Reply to a specific thread by providing the parent message timestamp. Leave empty for a new message."
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file-with-toggle",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 50 * 1024 * 1024,
      multiple: true,
      supportsVariables: true,
      description: "Attach files to your message (max 50MB per file)",
      hidden: true,
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