import { NodeComponent } from "../../../types"

const GMAIL_DELETE_EMAIL_METADATA = {
  key: "gmail_action_delete_email",
  name: "Delete Email",
  description: "Move an email to trash (can be recovered for 30 days)"
}

export const deleteEmailActionSchema: NodeComponent = {
  type: GMAIL_DELETE_EMAIL_METADATA.key,
  title: "Delete Email",
  description: GMAIL_DELETE_EMAIL_METADATA.description,
  icon: "Trash2" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  category: "Communication",
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "ID of the deleted email",
      example: "17c123456789abcd"
    },
    {
      name: "success",
      label: "Success Status",
      type: "boolean",
      description: "Whether the email was deleted successfully",
      example: true
    },
    {
      name: "deletedAt",
      label: "Deleted Time",
      type: "string",
      description: "When the email was moved to trash",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.messageId}}",
      supportsAI: true,
      description: "The ID of the email to delete. Use variables like {{trigger.messageId}} from a Gmail trigger.",
      tooltip: "This moves the email to trash. It will be permanently deleted after 30 days, but you can recover it before then."
    },
    {
      name: "permanentDelete",
      label: "Permanently Delete (Skip Trash)",
      type: "boolean",
      defaultValue: false,
      description: "Permanently delete the email immediately (cannot be recovered)",
      tooltip: "WARNING: Permanent deletion cannot be undone. The email will be immediately removed and cannot be recovered from trash."
    },
  ],
}
