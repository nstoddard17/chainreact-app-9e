import { NodeComponent } from "../../../types"

const SLACK_SEND_DM_METADATA = {
  key: "slack_action_send_direct_message",
  name: "Send Direct Message",
  description: "Send a direct message (DM) to a specific user"
}

export const sendDirectMessageActionSchema: NodeComponent = {
  type: SLACK_SEND_DM_METADATA.key,
  title: SLACK_SEND_DM_METADATA.name,
  description: SLACK_SEND_DM_METADATA.description,
  icon: "MessageCircle" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["chat:write", "im:write"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "user",
      label: "To",
      type: "combobox",
      required: true,
      dynamic: "slack_users",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a user...",
      description: "Choose which user to send a direct message to"
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
      name: "attachments",
      label: "Attachments",
      type: "file-with-toggle",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 50 * 1024 * 1024,
      multiple: true,
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
      label: "DM Channel ID",
      type: "string",
      description: "The ID of the direct message channel"
    },
    {
      name: "userId",
      label: "User ID",
      type: "string",
      description: "The ID of the user the DM was sent to"
    },
    {
      name: "message",
      label: "Message Object",
      type: "object",
      description: "The complete message object returned by Slack"
    }
  ]
}
