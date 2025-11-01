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
      placeholder: "{{trigger.recordId}}",
      supportsAI: true,
      description: "The ID of the record to add attachment to"
    },
    {
      name: "attachmentField",
      label: "Attachment Field",
      type: "select",
      dynamic: "airtable_attachment_fields",
      required: true,
      dependsOn: "tableName",
      placeholder: "Select attachment field...",
      description: "The attachment-type field to add the file to"
    },
    {
      name: "fileSource",
      label: "File Source",
      type: "select",
      required: true,
      options: [
        { value: "url", label: "From URL" },
        { value: "base64", label: "From Base64 Data" }
      ],
      defaultValue: "url",
      description: "How to provide the file data"
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
      visibleWhen: { field: "fileSource", value: "url" }
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
      visibleWhen: { field: "fileSource", value: "base64" }
    },
    {
      name: "filename",
      label: "Filename",
      type: "text",
      required: true,
      placeholder: "document.pdf",
      supportsAI: true,
      description: "Name for the attachment (include file extension)"
    }
  ]
}
