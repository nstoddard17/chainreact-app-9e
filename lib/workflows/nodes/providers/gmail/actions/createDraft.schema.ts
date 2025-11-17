import { NodeComponent } from "../../../types"

const GMAIL_CREATE_DRAFT_METADATA = {
  key: "gmail_action_create_draft",
  name: "Create Draft",
  description: "Create a draft email in Gmail without sending it"
}

export const createDraftActionSchema: NodeComponent = {
  type: GMAIL_CREATE_DRAFT_METADATA.key,
  title: "Create Draft",
  description: GMAIL_CREATE_DRAFT_METADATA.description,
  icon: "FileEdit" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/contacts.readonly"],
  category: "Communication",
  outputSchema: [
    {
      name: "draftId",
      label: "Draft ID",
      type: "string",
      description: "Unique identifier for the draft",
      example: "r1234567890abcdef"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Message ID of the draft",
      example: "17c123456789abcd"
    },
    {
      name: "to",
      label: "To Recipients",
      type: "array",
      description: "List of email addresses in the To field",
      example: ["user@example.com"]
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "The draft subject line",
      example: "Draft: Important message"
    },
    {
      name: "createdAt",
      label: "Created Time",
      type: "string",
      description: "When the draft was created (ISO 8601 format)",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "to",
      label: "To",
      type: "select",
      dynamic: "gmail-enhanced-recipients",
      loadOnMount: true,
      required: true,
      placeholder: "Select recipient email address...",
      description: "Choose recipient from your contacts and recent recipients"
    },
    {
      name: "cc",
      label: "CC",
      type: "select",
      dynamic: "gmail-enhanced-recipients",
      loadOnMount: true,
      required: false,
      placeholder: "Select CC email address...",
      description: "Choose CC recipient from your contacts and recent recipients"
    },
    {
      name: "bcc",
      label: "BCC",
      type: "select",
      dynamic: "gmail-enhanced-recipients",
      loadOnMount: true,
      required: false,
      placeholder: "Select BCC email address...",
      description: "Choose BCC recipient from your contacts and recent recipients"
    },
    {
      name: "subject",
      label: "Subject",
      type: "text",
      placeholder: "Email subject",
      required: true,
      description: "Subject line of the draft"
    },
    {
      name: "body",
      label: "Body",
      type: "email-rich-text",
      required: true,
      placeholder: "Compose your draft message...",
      description: "Draft message content with rich text formatting"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 25 * 1024 * 1024, // 25MB limit
      description: "Attach files to the draft"
    },
  ],
}
