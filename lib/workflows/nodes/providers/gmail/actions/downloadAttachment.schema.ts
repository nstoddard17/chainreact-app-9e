import { NodeComponent } from "../../../types"

const GMAIL_DOWNLOAD_ATTACHMENT_METADATA = {
  key: "gmail_action_download_attachment",
  name: "Download Attachment",
  description: "Save attachment to storage"
}

export const downloadAttachmentActionSchema: NodeComponent = {
  type: GMAIL_DOWNLOAD_ATTACHMENT_METADATA.key,
  title: "Download Attachment",
  description: GMAIL_DOWNLOAD_ATTACHMENT_METADATA.description,
  icon: "Download" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  category: "Communication",
  outputSchema: [
    {
      name: "filename",
      label: "Filename",
      type: "string",
      description: "The name of the downloaded file",
      example: "report.pdf"
    },
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "The ID of the file in the storage service",
      example: "1A2B3C4D..."
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "string",
      description: "URL to access the file in storage",
      example: "https://drive.google.com/file/d/..."
    },
    {
      name: "size",
      label: "Size (bytes)",
      type: "number",
      description: "Size of the downloaded file",
      example: 1024000
    },
    {
      name: "savedTo",
      label: "Saved To",
      type: "string",
      description: "The storage service where the file was saved",
      example: "Google Drive"
    },
    {
      name: "folderPath",
      label: "Folder Path",
      type: "string",
      description: "Path where the file was saved",
      example: "/Email Attachments/2024"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the download was successful",
      example: true
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
        { value: "all", label: "All Attachments" }
      ],
      defaultValue: "all",
      description: "Which attachment(s) to download",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    },
    {
      name: "attachmentId",
      label: "Attachment ID",
      type: "text",
      required: true,
      placeholder: "{{trigger.attachments[0].id}}",
      supportsAI: true,
      description: "The unique ID of the attachment",
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
      description: "Exact filename of the attachment",
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
      description: "Text that the filename must contain",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } },
      visibleWhen: {
        field: "attachmentSelection",
        value: "pattern"
      }
    },
    {
      name: "storageService",
      label: "Storage Service",
      type: "select",
      required: true,
      options: [
        { value: "google_drive", label: "Google Drive" },
        { value: "onedrive", label: "OneDrive" },
        { value: "dropbox", label: "Dropbox" }
      ],
      description: "Where to save the attachment",
      tooltip: "You must have the corresponding integration connected to use this service.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    },
    {
      name: "folderId",
      label: "Folder",
      type: "select",
      dynamic: "storage-folders",
      required: false,
      dependsOn: "storageService",
      placeholder: "Select destination folder...",
      description: "Folder where attachment will be saved (defaults to root)",
      tooltip: "Leave empty to save in the root folder. The folder list is loaded from your connected storage service.",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    },
    {
      name: "filenameConflict",
      label: "If File Exists",
      type: "select",
      required: true,
      options: [
        { value: "rename", label: "Rename with timestamp" },
        { value: "overwrite", label: "Overwrite existing file" },
        { value: "skip", label: "Skip download" }
      ],
      defaultValue: "rename",
      description: "How to handle filename conflicts",
      tooltip: "Rename: Adds timestamp to filename. Overwrite: Replaces existing file. Skip: Does not download if file exists.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    },
    {
      name: "createDateFolder",
      label: "Organize by Date",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Create YYYY/MM subfolders automatically",
      tooltip: "When enabled, files are saved in Year/Month subfolders (e.g., 2024/01). Helps organize large volumes of attachments.",
      dependsOn: "messageId",
      hidden: { $deps: ["messageId"], $condition: { messageId: { $exists: false } } }
    }
  ]
}
