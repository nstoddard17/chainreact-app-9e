import { NodeComponent } from "../../../types"

const GMAIL_GET_ATTACHMENT_METADATA = {
  key: "gmail_action_get_attachment",
  name: "Get Attachment",
  description: "Retrieve a specific attachment from a Gmail message"
}

export const getAttachmentActionSchema: NodeComponent = {
  type: GMAIL_GET_ATTACHMENT_METADATA.key,
  title: "Get Attachment",
  description: GMAIL_GET_ATTACHMENT_METADATA.description,
  icon: "Paperclip" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  category: "Communication",
  outputSchema: [
    {
      name: "attachmentId",
      label: "Attachment ID",
      type: "string",
      description: "The unique ID of the attachment",
      example: "ANGjdJ8w..."
    },
    {
      name: "filename",
      label: "Filename",
      type: "string",
      description: "The name of the attachment file",
      example: "report.pdf"
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "The MIME type of the attachment",
      example: "application/pdf"
    },
    {
      name: "size",
      label: "Size (bytes)",
      type: "number",
      description: "Size of the attachment in bytes",
      example: 1024000
    },
    {
      name: "data",
      label: "Attachment Data",
      type: "string",
      description: "Base64-encoded attachment data",
      example: "JVBERi0xLjQK..."
    },
    {
      name: "downloadUrl",
      label: "Download URL",
      type: "string",
      description: "Temporary URL to download the attachment",
      example: "https://mail.google.com/mail/..."
    }
  ],
  configSchema: [
    {
      name: "messageId",
      label: "Email",
      type: "combobox",
      required: true,
      placeholder: "Select an email or use {{trigger.messageId}}",
      dynamic: "gmail-recent-emails",
      loadOnMount: true,
      searchable: true,
      supportsVariables: true,
      supportsAI: true,
      description: "Select an email from your recent messages or enter an email ID",
      tooltip: "Search by subject or sender, or use a variable like {{trigger.messageId}}. Recent emails are shown by default."
    },
    {
      name: "attachmentSelection",
      label: "Select Attachment By",
      type: "select",
      required: true,
      options: [
        { value: "id", label: "Attachment ID" },
        { value: "filename", label: "Filename (exact match)" },
        { value: "pattern", label: "Filename Pattern (contains)" },
        { value: "first", label: "First Attachment" }
      ],
      defaultValue: "first",
      description: "How to identify which attachment to retrieve",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    },
    {
      name: "attachmentId",
      label: "Attachment ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.attachments[0].id}} or ANGjdJ8w...",
      supportsAI: true,
      description: "The unique ID of the attachment",
      tooltip: "Get this from the 'New Attachment' trigger or 'Search Emails' action.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } },
      visibleWhen: {
        field: "attachmentSelection",
        value: "id"
      }
    },
    {
      name: "filename",
      label: "Filename",
      type: "text",
      required: true,
      placeholder: "report.pdf",
      supportsAI: true,
      description: "Exact filename of the attachment (case-sensitive)",
      tooltip: "Must match exactly, including file extension. Example: 'Report.pdf' will not match 'report.pdf'.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } },
      visibleWhen: {
        field: "attachmentSelection",
        value: "filename"
      }
    },
    {
      name: "filenamePattern",
      label: "Filename Pattern",
      type: "text",
      required: true,
      placeholder: "invoice",
      supportsAI: true,
      description: "Text that the filename must contain (case-insensitive)",
      tooltip: "Retrieves the first attachment whose filename contains this text. Example: 'invoice' matches 'Invoice-2024.pdf'.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } },
      visibleWhen: {
        field: "attachmentSelection",
        value: "pattern"
      }
    },
    {
      name: "saveToVariable",
      label: "Save Attachment Data",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Include base64-encoded attachment data in output",
      tooltip: "When enabled, the full attachment data is included. Disable for large files to reduce memory usage if you only need metadata.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    }
  ]
}
