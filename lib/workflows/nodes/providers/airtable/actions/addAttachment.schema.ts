import { NodeComponent } from "../../../types"

export const addAttachmentActionSchema: NodeComponent = {
  type: "airtable_action_add_attachment",
  title: "Add Attachment",
  description: "Add a file attachment to an attachment field in a record",
  icon: "Paperclip" as any,
  isTrigger: false,
  providerId: "airtable",
  testable: true,
  requiredScopes: ["data.records:write"],
  category: "Productivity",
  producesOutput: true,
  outputSchema: [
    { name: "recordId", label: "Record ID", type: "string", description: "The ID of the updated record" },
    { name: "attachmentId", label: "Attachment ID", type: "string", description: "The ID of the added attachment" },
    { name: "attachmentUrl", label: "Attachment URL", type: "string", description: "URL to access the attachment" },
    { name: "filename", label: "Filename", type: "string", description: "The name of the attached file" }
  ],
  configSchema: [
    {
      name: "baseId",
      label: "Base",
      type: "select",
      dynamic: "airtable_bases",
      required: true,
      loadOnMount: true,
      placeholder: "Select a base"
    },
    {
      name: "tableName",
      label: "Table",
      type: "select",
      dynamic: "airtable_tables",
      required: true,
      placeholder: "Select a table",
      dependsOn: "baseId"
    },
    {
      name: "recordId",
      label: "Record ID",
      type: "text",
      required: true,
      placeholder: "Click a row below or paste: {{trigger.recordId}}",
      supportsAI: true,
      description: "The ID of the record to add attachment to",
      dependsOn: "tableName"
    },
    {
      name: "attachmentField",
      label: "Attachment Field",
      type: "select",
      dynamic: "airtable_attachment_fields",
      required: true,
      dependsOn: "tableName",
      loadOnChange: true,
      placeholder: "Select attachment field...",
      description: "The attachment-type field to add the file to"
    },
    {
      name: "preserveExisting",
      label: "Append or Replace",
      type: "select",
      required: true,
      options: [
        { value: "true", label: "Append to existing attachments" },
        { value: "false", label: "Replace all existing attachments" }
      ],
      defaultValue: "true",
      description: "Choose whether to keep or replace existing attachments",
      tooltip: "Append will add this file to existing attachments. Replace will remove all existing attachments and add only this file.",
      dependsOn: "tableName"
    },
    {
      name: "fileSource",
      label: "File Source",
      type: "select",
      required: true,
      options: [
        { value: "upload", label: "Upload File" },
        { value: "url", label: "From URL" },
        { value: "base64", label: "From Base64 Data" }
      ],
      defaultValue: "url",
      description: "How to provide the file data",
      dependsOn: "tableName"
    },
    {
      name: "uploadedFile",
      label: "Upload File",
      type: "file",
      required: true,
      description: "Upload a file from your computer",
      placeholder: "Choose files to upload...",
      supportsVariables: true,
      visibleWhen: { field: "fileSource", value: "upload" },
      dependsOn: "tableName"
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: true,
      placeholder: "https://example.com/document.pdf",
      supportsAI: true,
      description: "URL of the file to attach",
      tooltip: "Must be a publicly accessible URL. Airtable will download the file from this URL.",
      visibleWhen: { field: "fileSource", value: "url" },
      dependsOn: "tableName"
    },
    {
      name: "base64Data",
      label: "Base64 File Data",
      type: "textarea",
      required: true,
      rows: 4,
      placeholder: "JVBERi0xLjQK...",
      supportsAI: true,
      description: "Base64-encoded file data",
      visibleWhen: { field: "fileSource", value: "base64" },
      dependsOn: "tableName"
    },
    {
      name: "filename",
      label: "File Name",
      type: "text",
      required: true,
      placeholder: "document.pdf",
      supportsAI: true,
      description: "Name for the attachment (include file extension)",
      tooltip: "When uploading a file, the filename is taken from the file automatically. For URL/Base64, specify the filename here.",
      visibilityCondition: {
        or: [
          { field: "fileSource", operator: "equals", value: "url" },
          { field: "fileSource", operator: "equals", value: "base64" }
        ]
      },
      dependsOn: "tableName"
    },
    {
      name: "contentType",
      label: "Content Type (Optional)",
      type: "select",
      required: false,
      creatable: true,
      placeholder: "Auto-detect from filename",
      options: [
        { value: "image/png", label: "PNG Image (image/png)" },
        { value: "image/jpeg", label: "JPEG Image (image/jpeg)" },
        { value: "image/gif", label: "GIF Image (image/gif)" },
        { value: "image/svg+xml", label: "SVG Image (image/svg+xml)" },
        { value: "image/webp", label: "WebP Image (image/webp)" },
        { value: "application/pdf", label: "PDF Document (application/pdf)" },
        { value: "application/msword", label: "Word Document (application/msword)" },
        { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word Document (DOCX)" },
        { value: "application/vnd.ms-excel", label: "Excel Spreadsheet (application/vnd.ms-excel)" },
        { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel Spreadsheet (XLSX)" },
        { value: "application/vnd.ms-powerpoint", label: "PowerPoint (application/vnd.ms-powerpoint)" },
        { value: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint (PPTX)" },
        { value: "text/plain", label: "Text File (text/plain)" },
        { value: "text/csv", label: "CSV File (text/csv)" },
        { value: "text/html", label: "HTML File (text/html)" },
        { value: "application/json", label: "JSON File (application/json)" },
        { value: "application/xml", label: "XML File (application/xml)" },
        { value: "application/zip", label: "ZIP Archive (application/zip)" },
        { value: "video/mp4", label: "MP4 Video (video/mp4)" },
        { value: "audio/mpeg", label: "MP3 Audio (audio/mpeg)" },
        { value: "audio/wav", label: "WAV Audio (audio/wav)" }
      ],
      description: "MIME type of the file (e.g., image/png, application/pdf)",
      tooltip: "If not specified, Airtable will attempt to detect it from the filename. You can also type a custom MIME type.",
      advanced: true,
      dependsOn: "tableName"
    }
  ]
}
