import { NodeComponent } from "../../../types"

const SLACK_GET_FILE_INFO_METADATA = {
  key: "slack_action_get_file_info",
  name: "Get File Info",
  description: "Get detailed information about a file"
}

export const getFileInfoActionSchema: NodeComponent = {
  type: SLACK_GET_FILE_INFO_METADATA.key,
  title: SLACK_GET_FILE_INFO_METADATA.name,
  description: SLACK_GET_FILE_INFO_METADATA.description,
  icon: "FileSearch" as any, // Will be resolved in index file
  providerId: "slack",
  requiredScopes: ["files:read"],
  category: "Communication",
  isTrigger: false,
  configSchema: [
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      dynamic: "slack_workspaces",
      required: true,
      loadOnMount: true,
      placeholder: "Select Slack workspace",
      description: "Your Slack workspace (used for authentication)"
    },
    {
      name: "asUser",
      label: "Execute as User",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Execute this action as yourself instead of the Chain React bot. Requires reconnecting Slack with user permissions.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "fileSource",
      label: "How to Specify File",
      type: "select",
      required: true,
      defaultValue: "manual",
      options: [
        { label: "Enter File ID manually (recommended)", value: "manual" },
        { label: "Select from my recent files", value: "list" }
      ],
      description: "Choose how to identify the file",
      tooltip: "Manual entry is recommended because the file list only shows YOUR uploaded files, not all workspace files. Use manual entry when working with files uploaded by others or from triggers.",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "fileIdManual",
      label: "File ID",
      type: "text",
      required: true,
      placeholder: "F1234567890 or {{trigger.file.id}}",
      supportsAI: true,
      description: "The Slack file ID (starts with F)",
      tooltip: "Enter the file ID. You can get this from a File Uploaded trigger, file URL, or by right-clicking a file in Slack → Copy Link, then extract the ID from the URL.",
      dependsOn: "fileSource",
      hidden: {
        $deps: ["fileSource"],
        $condition: { fileSource: { $ne: "manual" } }
      }
    },
    {
      name: "fileId",
      label: "Select File",
      type: "select",
      dynamic: "slack_files",
      required: true,
      placeholder: "Select from your uploaded files",
      description: "Note: Only shows files YOU uploaded (Slack API limitation)",
      tooltip: "This dropdown only shows files uploaded by you, not all workspace files. If you don't see the file you need, switch to 'Enter File ID manually' above.",
      dependsOn: "workspace",
      reloadOnChange: ["asUser"], // Reload when asUser checkbox changes
      hidden: {
        $deps: ["workspace", "fileSource"],
        $condition: {
          $or: [
            { workspace: { $exists: false } },
            { fileSource: { $ne: "list" } }
          ]
        }
      }
    },
    {
      name: "includeComments",
      label: "Include Comments",
      type: "boolean",
      defaultValue: false,
      tooltip: "Include comments and reactions on the file",
      dependsOn: "workspace",
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    }
  ],
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "The unique ID of the file",
      example: "F1234567890"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "The name of the file",
      example: "document.pdf"
    },
    {
      name: "title",
      label: "Title",
      type: "string",
      description: "The title of the file",
      example: "Q4 Report"
    },
    {
      name: "fileType",
      label: "File Type",
      type: "string",
      description: "The type of file (e.g., pdf, png, docx)",
      example: "pdf"
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "The MIME type of the file",
      example: "application/pdf"
    },
    {
      name: "fileSize",
      label: "File Size (Bytes)",
      type: "number",
      description: "Size of the file in bytes",
      example: 1048576
    },
    {
      name: "created",
      label: "Created At",
      type: "string",
      description: "When the file was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "uploaderId",
      label: "Uploader ID",
      type: "string",
      description: "The ID of the user who uploaded the file",
      example: "U1234567890"
    },
    {
      name: "uploaderName",
      label: "Uploader Name",
      type: "string",
      description: "The name of the user who uploaded the file",
      example: "John Doe"
    },
    {
      name: "isPublic",
      label: "Is Public",
      type: "boolean",
      description: "Whether the file is public",
      example: false
    },
    {
      name: "isExternal",
      label: "Is External",
      type: "boolean",
      description: "Whether the file is hosted externally",
      example: false
    },
    {
      name: "channels",
      label: "Shared in Channels",
      type: "array",
      description: "Array of channel IDs where the file is shared",
      example: ["C1234567890", "C0987654321"]
    },
    {
      name: "urlPrivate",
      label: "Private URL",
      type: "string",
      description: "Private download URL (requires auth)",
      example: "https://files.slack.com/files-pri/..."
    },
    {
      name: "urlPrivateDownload",
      label: "Private Download URL",
      type: "string",
      description: "Direct download URL (requires auth)",
      example: "https://files.slack.com/files-pri/.../download/..."
    },
    {
      name: "permalink",
      label: "Permalink",
      type: "string",
      description: "Permanent link to view the file in Slack",
      example: "https://workspace.slack.com/files/..."
    },
    {
      name: "commentsCount",
      label: "Comments Count",
      type: "number",
      description: "Number of comments on the file",
      example: 3
    },
    {
      name: "comments",
      label: "Comments",
      type: "array",
      description: "Array of comment objects (if includeComments is true)",
      example: []
    }
  ]
}
