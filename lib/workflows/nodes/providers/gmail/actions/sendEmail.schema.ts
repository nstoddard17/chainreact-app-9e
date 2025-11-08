import { NodeComponent } from "../../../types"
// Import metadata from integrations folder
// Note: These imports may need adjustment based on project structure
const GMAIL_SEND_EMAIL_METADATA = {
  key: "gmail_action_send_email",
  name: "Send Gmail Message",
  description: "Compose and send an email through your Gmail account"
}

export const sendEmailActionSchema: NodeComponent = {
  type: GMAIL_SEND_EMAIL_METADATA.key,
  title: "Send Email",
  description: GMAIL_SEND_EMAIL_METADATA.description,
  icon: "Mail" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/contacts.readonly"],
  category: "Communication",
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Unique identifier for the sent email",
      example: "17c123456789abcd"
    },
    {
      name: "to",
      label: "To Recipients",
      type: "array",
      description: "List of email addresses the message was sent to",
      example: ["user@example.com", "another@example.com"]
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The email subject line",
      example: "Your order confirmation"
    },
    {
      name: "timestamp",
      label: "Sent Time",
      type: "string",
      description: "When the email was sent (ISO 8601 format)",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success Status",
      type: "boolean",
      description: "Whether the email was sent successfully",
      example: true
    }
  ],
  configSchema: [
    {
      name: "from",
      label: "From",
      type: "select",
      dynamic: "gmail_from_addresses",
      loadOnMount: true,
      required: false,
      placeholder: "Select sender email address (default: your primary email)...",
      description: "Choose which email address to send from. Includes your primary email, send-as aliases, and recent sender addresses.",
      tooltip: "If not specified, Gmail will use your primary email address"
    },
    {
      name: "to",
      label: "To",
      type: "email-autocomplete",
      dynamic: "gmail-recent-recipients",
      required: true,
      placeholder: "Select recipient email address..."
    },
    {
      name: "cc",
      label: "CC",
      type: "email-autocomplete",
      dynamic: "gmail-recent-recipients",
      placeholder: "Select CC email address..."
    },
    {
      name: "bcc",
      label: "BCC",
      type: "email-autocomplete",
      dynamic: "gmail-recent-recipients",
      placeholder: "Select BCC email address..."
    },
    {
      name: "subject",
      label: "Subject",
      type: "text",
      placeholder: "Email subject",
      required: true,
      description: "Subject line of the email"
    },
    {
      name: "body",
      label: "Body",
      type: "email-rich-text",
      required: true,
      placeholder: "Compose your email message...",
      description: "Email message content with rich text formatting"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 25 * 1024 * 1024, // 25MB limit (Gmail's attachment limit)
      description: "Attach files from your computer or select files from previous workflow nodes"
    },
    {
      name: "signature",
      label: "Email Signature (Optional)",
      type: "rich-text",
      required: false,
      placeholder: "Best regards,\nYour Name",
      supportsAI: true,
      description: "Optional email signature to append at the end of your message. Supports rich text formatting."
    },
  ],
}