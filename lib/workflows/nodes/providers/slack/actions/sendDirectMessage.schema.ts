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
    // Parent field - always visible
    {
      name: "user",
      label: "User",
      type: "combobox",
      required: true,
      dynamic: "slack-users",
      loadOnMount: true,
      searchable: true,
      placeholder: "Select a user or enter user ID",
      tooltip: "Select the user to send a direct message to. You can search by name or email, or paste a user ID from a previous step."
    },

    // Cascaded fields - only show after user selected
    {
      name: "message",
      label: "Message",
      type: "rich-text",
      required: true,
      placeholder: "Type your message...",
      defaultValue: "",
      tooltip: "The message content with rich text formatting (bold, italic, links, etc.). You can drag variables from the right panel to include dynamic content from previous workflow steps.",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file-with-toggle",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 50 * 1024 * 1024, // 50MB limit
      multiple: true,
      tooltip: "Attach files to your direct message (max 50MB per file). Upload: Choose files from your computer. URL: Provide direct links to files. Variables: Drag from the variable panel.",
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
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, @mentions in your message will become clickable links to user profiles.",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, Slack will automatically show rich previews for URLs in your message (website titles, descriptions, and images).",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "unfurlMedia",
      label: "Unfurl Media",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, Slack will automatically show previews for media links (images, videos).",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "asUser",
      label: "Send as User",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, sends the message as YOU (the actual user) instead of the bot. This only works if you granted user permissions during Slack connection.",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "username",
      label: "Bot Username (Optional)",
      type: "text",
      placeholder: "Custom bot username",
      tooltip: "Override the bot's display name for this message only. Works with bot token (when 'Send as User' is OFF).",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      visibilityCondition: {
        field: "asUser",
        operator: "equals",
        value: false
      }
    },
    {
      name: "icon",
      label: "Bot Icon (Optional)",
      type: "file-with-toggle",
      accept: ".jpg,.jpeg,.png,.gif,.webp",
      maxSize: 5 * 1024 * 1024, // 5MB limit for icons
      tooltip: "Override the bot's icon for this message only. Works with bot token (when 'Send as User' is OFF). Upload an image or provide a URL.",
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
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      visibilityCondition: {
        field: "asUser",
        operator: "equals",
        value: false
      }
    },
    {
      name: "messageType",
      label: "Message Type",
      type: "select",
      required: false,
      defaultValue: "simple",
      options: [
        { label: "Simple Text", value: "simple" },
        { label: "Buttons", value: "buttons" },
        { label: "Status Message", value: "status" },
        { label: "Approval Request", value: "approval" },
        { label: "Custom Blocks", value: "custom" }
      ],
      tooltip: "Choose the type of message to send. Simple Text: Plain message. Buttons: Add interactive buttons. Status: Colored status message. Approval: Request approval. Custom Blocks: Use custom Block Kit JSON.",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      }
    },
    {
      name: "buttonConfig",
      label: "Button Configuration",
      type: "array",
      required: false,
      placeholder: JSON.stringify([{ text: "Click Me", value: "button_1", style: "primary" }], null, 2),
      supportsAI: true,
      tooltip: "Array of button objects. Each button needs: text (button label), value (unique ID), style (primary/danger/default). Example: [{text: 'Approve', value: 'approve', style: 'primary'}, {text: 'Deny', value: 'deny', style: 'danger'}]",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "buttons" }
    },
    {
      name: "statusTitle",
      label: "Status Title",
      type: "text",
      required: false,
      placeholder: "Status Update",
      supportsAI: true,
      tooltip: "Title for the status message",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "statusMessage",
      label: "Status Message",
      type: "text",
      required: false,
      placeholder: "Task completed successfully",
      supportsAI: true,
      tooltip: "The status message content",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "statusColor",
      label: "Status Color",
      type: "select",
      required: false,
      defaultValue: "good",
      options: [
        { label: "Good (Green)", value: "good" },
        { label: "Warning (Yellow)", value: "warning" },
        { label: "Danger (Red)", value: "danger" },
        { label: "Info (Blue)", value: "#36a64f" }
      ],
      tooltip: "Color for the status message border",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "statusFields",
      label: "Status Fields",
      type: "array",
      required: false,
      placeholder: JSON.stringify([{ title: "Field", value: "Value", short: true }], null, 2),
      supportsAI: true,
      tooltip: "Additional fields to display in status. Each field needs: title, value, short (boolean).",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "approvalTitle",
      label: "Approval Title",
      type: "text",
      required: false,
      placeholder: "Approval Required",
      supportsAI: true,
      tooltip: "Title for the approval request",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "approval" }
    },
    {
      name: "approvalDescription",
      label: "Approval Description",
      type: "text",
      required: false,
      placeholder: "Please review and approve this request",
      supportsAI: true,
      tooltip: "Description of what needs approval",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "approval" }
    },
    {
      name: "approvalApproveText",
      label: "Approve Button Text",
      type: "text",
      required: false,
      defaultValue: "Approve",
      placeholder: "Approve",
      tooltip: "Text for the approve button",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "approval" }
    },
    {
      name: "approvalDenyText",
      label: "Deny Button Text",
      type: "text",
      required: false,
      defaultValue: "Deny",
      placeholder: "Deny",
      tooltip: "Text for the deny button",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "approval" }
    },
    {
      name: "customBlocks",
      label: "Custom Block Kit JSON",
      type: "object",
      required: false,
      placeholder: JSON.stringify([{ type: "section", text: { type: "mrkdwn", text: "Custom block" } }], null, 2),
      supportsAI: true,
      tooltip: "Custom Block Kit JSON for advanced formatting. See Slack Block Kit Builder: https://app.slack.com/block-kit-builder",
      dependsOn: "user",
      hidden: {
        $deps: ["user"],
        $condition: { user: { $exists: false } }
      },
      showIf: { field: "messageType", value: "custom" }
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
