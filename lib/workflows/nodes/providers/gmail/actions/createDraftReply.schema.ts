import { NodeComponent } from "../../../types"

const GMAIL_CREATE_DRAFT_REPLY_METADATA = {
  key: "gmail_action_create_draft_reply",
  name: "Create Draft Reply",
  description: "Create a draft reply to an existing email"
}

export const createDraftReplyActionSchema: NodeComponent = {
  type: GMAIL_CREATE_DRAFT_REPLY_METADATA.key,
  title: "Create Draft Reply",
  description: GMAIL_CREATE_DRAFT_REPLY_METADATA.description,
  icon: "Reply" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.compose"],
  category: "Communication",
  outputSchema: [
    {
      name: "draftId",
      label: "Draft ID",
      type: "string",
      description: "Unique identifier for the draft reply",
      example: "r1234567890abcdef"
    },
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Message ID of the draft reply",
      example: "17c123456789abcd"
    },
    {
      name: "threadId",
      label: "Thread ID",
      type: "string",
      description: "Thread ID of the conversation",
      example: "17c123456789abcd"
    },
    {
      name: "inReplyTo",
      label: "In Reply To",
      type: "string",
      description: "Message ID of the original email",
      example: "17c123456789abcd"
    },
    {
      name: "createdAt",
      label: "Created Time",
      type: "string",
      description: "When the draft reply was created",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "messageId",
      label: "Message ID to Reply To",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}}",
      supportsAI: true,
      description: "The ID of the email you're replying to. Use variables like {{trigger.messageId}} from a trigger.",
      tooltip: "Get this from a Gmail trigger or previous Gmail action. The draft reply will be part of the same conversation thread."
    },
    {
      name: "cc",
      label: "CC (Additional)",
      type: "select",
      dynamic: "gmail-enhanced-recipients",
      loadOnMount: true,
      required: false,
      placeholder: "Select additional CC recipients...",
      description: "Add additional CC recipients to the draft reply (optional)"
    },
    {
      name: "bcc",
      label: "BCC (Additional)",
      type: "select",
      dynamic: "gmail-enhanced-recipients",
      loadOnMount: true,
      required: false,
      placeholder: "Select additional BCC recipients...",
      description: "Add additional BCC recipients to the draft reply (optional)"
    },
    {
      name: "body",
      label: "Reply Message",
      type: "email-rich-text",
      required: true,
      placeholder: "Type your reply...",
      description: "Your reply message content with rich text formatting"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file",
      required: false,
      placeholder: "Select files to attach",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 25 * 1024 * 1024,
      supportsVariables: true,
      description: "Attach files to the reply draft"
    },
    {
      name: "replyAll",
      label: "Reply All",
      type: "boolean",
      defaultValue: false,
      description: "Include all original recipients in the reply"
    },
  ],
}
