import { NodeComponent } from "../../../types"

export const newAttachmentTriggerSchema: NodeComponent = {
  type: "gmail_trigger_new_attachment",
  title: "New Attachment",
  description: "Triggers when you receive a new email with an attachment",
  icon: "Paperclip" as any, // Will be resolved in index file
  providerId: "gmail",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  configSchema: [
    {
      name: "fileType",
      label: "File Type Filter (Optional)",
      type: "select",
      required: false,
      options: [
        { value: "any", label: "Any file type" },
        { value: "pdf", label: "PDF documents" },
        { value: "image", label: "Images (jpg, png, gif)" },
        { value: "document", label: "Documents (doc, docx, txt)" },
        { value: "spreadsheet", label: "Spreadsheets (xls, xlsx, csv)" },
        { value: "presentation", label: "Presentations (ppt, pptx)" },
        { value: "video", label: "Videos (mp4, avi, mov)" },
        { value: "audio", label: "Audio (mp3, wav)" },
        { value: "archive", label: "Archives (zip, rar, 7z)" }
      ],
      defaultValue: "any",
      description: "Filter emails by attachment type"
    },
    {
      name: "from",
      label: "From (Optional)",
      type: "email-autocomplete",
      dynamic: "gmail-recent-senders",
      required: false,
      placeholder: "Filter by sender email...",
      description: "Only trigger for emails from specific senders"
    },
    {
      name: "minSize",
      label: "Minimum Attachment Size (MB)",
      type: "number",
      required: false,
      placeholder: "0",
      min: 0,
      max: 25,
      description: "Only trigger for attachments larger than this size (in MB)"
    },
  ],
  outputSchema: [
    {
      name: "messageId",
      label: "Message ID",
      type: "string",
      description: "Unique identifier for the email"
    },
    {
      name: "subject",
      label: "Subject",
      type: "string",
      description: "Email subject line"
    },
    {
      name: "from",
      label: "From",
      type: "string",
      description: "Sender's email address"
    },
    {
      name: "fromName",
      label: "From Name",
      type: "string",
      description: "Sender's display name"
    },
    {
      name: "bodyPlain",
      label: "Body (Plain Text)",
      type: "string",
      description: "Email body in plain text"
    },
    {
      name: "bodyHtml",
      label: "Body (HTML)",
      type: "string",
      description: "Email body in HTML format"
    },
    {
      name: "attachments",
      label: "Attachments",
      type: "array",
      description: "Array of attachment objects with filename, mimeType, size, and data"
    },
    {
      name: "attachmentCount",
      label: "Attachment Count",
      type: "number",
      description: "Number of attachments in the email"
    },
    {
      name: "receivedAt",
      label: "Received At",
      type: "string",
      description: "When the email was received"
    },
    {
      name: "labels",
      label: "Labels",
      type: "array",
      description: "Gmail labels applied to this email"
    }
  ],
}
