import { NodeComponent } from "../../../types"

const GMAIL_ARCHIVE_EMAIL_METADATA = {
  key: "gmail_action_archive_email",
  name: "Archive Email",
  description: "Archive an email (remove from inbox, keep in All Mail)"
}

export const archiveEmailActionSchema: NodeComponent = {
  type: GMAIL_ARCHIVE_EMAIL_METADATA.key,
  title: "Archive Email",
  description: GMAIL_ARCHIVE_EMAIL_METADATA.description,
  icon: "Archive" as any, // Will be resolved in index file
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
      description: "ID of the archived email",
      example: "17c123456789abcd"
    },
    {
      name: "success",
      label: "Success Status",
      type: "boolean",
      description: "Whether the email was archived successfully",
      example: true
    },
    {
      name: "archivedAt",
      label: "Archived Time",
      type: "string",
      description: "When the email was archived",
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
      description: "The ID of the email to archive. Use variables like {{trigger.messageId}} from a Gmail trigger.",
      tooltip: "Archiving removes the email from your inbox but keeps it in All Mail. You can find it later with search or labels."
    },
  ],
}
