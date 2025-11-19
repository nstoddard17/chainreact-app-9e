import { NodeComponent } from "../../../types"

const GMAIL_REPLY_TO_EMAIL_METADATA = {
  key: "gmail_action_reply_to_email",
  name: "Reply to Email",
  description: "Send a reply to an existing email thread"
}

export const replyToEmailActionSchema: NodeComponent = {
  type: GMAIL_REPLY_TO_EMAIL_METADATA.key,
  title: "Reply to Email",
  description: GMAIL_REPLY_TO_EMAIL_METADATA.description,
  icon: "Reply" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
  category: "Communication",
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Unique identifier for the sent reply",
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
      name: "subject",
      label: "Subject",
      type: "string",
      description: "Subject line of the reply email",
      example: "Re: Meeting Tomorrow"
    },
    {
      name: "inReplyTo",
      label: "In Reply To",
      type: "string",
      description: "Message ID of the original email",
      example: "17c123456789abcd"
    },
    {
      name: "sentAt",
      label: "Sent Time",
      type: "string",
      description: "When the reply was sent",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success Status",
      type: "boolean",
      description: "Whether the reply was sent successfully",
      example: true
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
      tooltip: "The reply will be part of the same conversation thread as the original message."
    },
    {
      name: "subject",
      label: "Subject (Optional)",
      type: "text",
      required: false,
      placeholder: "Leave blank to auto-generate 'Re: Original Subject'",
      supportsAI: true,
      description: "Override the automatic subject line. If left blank, will use 'Re: [Original Subject]'",
      tooltip: "By default, Gmail will prepend 'Re: ' to the original subject. Use this to customize the subject line."
    },
    {
      name: "body",
      label: "Body",
      type: "email-rich-text",
      required: true,
      placeholder: "Type your reply...",
      description: "Your reply message content with rich text formatting",
      supportsAI: true
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "file",
      required: false,
      placeholder: "Upload files or use a variable from a previous node",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar",
      maxSize: 25 * 1024 * 1024,
      supportsVariables: true,
      supportsAI: true,
      description: "Upload files or use a variable from a previous node like {{getAttachment.attachments}}",
      tooltip: "You can either upload files directly or reference attachment data from previous nodes (e.g., {{getAttachment.attachments}})"
    },
    {
      name: "replyAll",
      label: "Reply All",
      type: "boolean",
      defaultValue: false,
      description: "Include all original recipients (To and CC) in the reply",
      tooltip: "When enabled, your reply will be sent to everyone who received the original email. When disabled, only the sender receives the reply."
    },
    {
      name: "signature",
      label: "Email Signature (Optional)",
      type: "rich-text",
      required: false,
      placeholder: "Best regards,\nYour Name",
      supportsAI: true,
      description: "Optional email signature to append at the end of your reply"
    },
  ],
}
