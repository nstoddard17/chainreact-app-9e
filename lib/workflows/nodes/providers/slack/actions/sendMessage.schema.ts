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
      },
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "linkNames",
      label: "Link Names",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, @mentions and #channel references in your message will become clickable links. For example, @username becomes a link to that user's profile. Useful for notifications.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "unfurlLinks",
      label: "Unfurl Links",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, Slack will automatically show rich previews for URLs in your message (website titles, descriptions, and images). Disable for cleaner, text-only messages.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "unfurlMedia",
      label: "Unfurl Media",
      type: "boolean",
      defaultValue: true,
      tooltip: "When enabled, Slack will automatically show previews for media links (images, videos). Disable to show URLs without previews.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "threadTimestamp",
      label: "Thread Timestamp (Optional)",
      type: "text",
      required: false,
      placeholder: "{{trigger.ts}}",
      supportsAI: true,
      tooltip: "Reply to a specific message by providing its timestamp. Use variables like {{trigger.ts}} or {{previous_node.ts}} to thread replies. Leave empty to send as a new message.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "asUser",
      label: "Send as User",
      type: "boolean",
      defaultValue: false,
      tooltip: "When enabled, sends the message as YOU (the actual user) instead of the bot. This only works if you granted user permissions during Slack connection. When disabled, the message is sent as the bot and can be customized with username and icon fields below.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      }
    },
    {
      name: "username",
      label: "Bot Username (Optional)",
      type: "text",
      placeholder: "Custom bot username",
      tooltip: "Override the bot's display name for this message only. Works with bot token (when 'Send as User' is OFF). May be ignored if workspace has 'Lock bot name & icon' enabled in Slack admin settings. Leave empty to use default bot name.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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
        { label: "Poll", value: "poll" },
        { label: "Custom Blocks", value: "custom" }
      ],
      tooltip: "Choose the type of message to send. Simple Text: Plain message. Buttons: Add interactive buttons. Status: Colored status message. Approval: Yes/No approval workflow. Poll: Create a poll. Custom Blocks: Use custom Block Kit JSON.",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "buttons" }
    },
    {
      name: "statusTitle",
      label: "Status Title",
      type: "text",
      required: false,
      placeholder: "Deployment Status",
      supportsAI: true,
      tooltip: "Title for the status message",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "statusMessage",
      label: "Status Message",
      type: "text",
      required: false,
      placeholder: "Build completed successfully",
      supportsAI: true,
      tooltip: "The status message content",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "statusFields",
      label: "Status Fields",
      type: "array",
      required: false,
      placeholder: JSON.stringify([{ title: "Environment", value: "Production", short: true }], null, 2),
      supportsAI: true,
      tooltip: "Additional fields to display in status. Each field needs: title, value, short (boolean). Example: [{title: 'Environment', value: 'Production', short: true}]",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "status" }
    },
    {
      name: "approvalTitle",
      label: "Approval Title",
      type: "text",
      required: false,
      placeholder: "Deployment Approval Required",
      supportsAI: true,
      tooltip: "Title for the approval request",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "approval" }
    },
    {
      name: "approvalDescription",
      label: "Approval Description",
      type: "text",
      required: false,
      placeholder: "Please approve deployment to production",
      supportsAI: true,
      tooltip: "Description of what needs approval",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "approval" }
    },
    {
      name: "pollQuestion",
      label: "Poll Question",
      type: "text",
      required: false,
      placeholder: "What's your favorite programming language?",
      supportsAI: true,
      tooltip: "The question for the poll",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "poll" }
    },
    {
      name: "pollOptions",
      label: "Poll Options",
      type: "array",
      required: false,
      placeholder: JSON.stringify(["JavaScript", "Python", "TypeScript", "Go"], null, 2),
      supportsAI: true,
      tooltip: "Array of poll options. Example: ['Option 1', 'Option 2', 'Option 3']",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "poll" }
    },
    {
      name: "customBlocks",
      label: "Custom Block Kit JSON",
      type: "object",
      required: false,
      placeholder: JSON.stringify([{ type: "section", text: { type: "mrkdwn", text: "Custom block" } }], null, 2),
      supportsAI: true,
      tooltip: "Custom Block Kit JSON for advanced formatting. See Slack Block Kit Builder: https://app.slack.com/block-kit-builder",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
      },
      showIf: { field: "messageType", value: "custom" }
    },
    {
      name: "legacyAttachments",
      label: "Legacy Attachments (Advanced)",
      type: "array",
      required: false,
      placeholder: JSON.stringify([{ fallback: "Fallback text", color: "#36a64f", fields: [] }], null, 2),
      tooltip: "Legacy attachment format (deprecated by Slack, use Block Kit instead)",
      dependsOn: "channel",
      hidden: {
        $deps: ["channel"],
        $condition: { channel: { $exists: false } }
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