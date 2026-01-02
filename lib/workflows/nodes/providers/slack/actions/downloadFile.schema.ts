import { NodeComponent } from "../../../types"

const SLACK_DOWNLOAD_FILE_METADATA = {
  key: "slack_action_download_file",
  name: "Download File",
  description: "Download a file from Slack"
}

export const downloadFileActionSchema: NodeComponent = {
  type: SLACK_DOWNLOAD_FILE_METADATA.key,
  title: SLACK_DOWNLOAD_FILE_METADATA.name,
  description: SLACK_DOWNLOAD_FILE_METADATA.description,
  icon: "Download" as any, // Will be resolved in index file
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
      name: "fileId",
      label: "File",
      type: "select",
      dynamic: "slack_files",
      required: true,
      placeholder: "Select a file to download",
      description: "The file to download from Slack",
      tooltip: "Select the file you want to download. Shows recent files from your workspace.",
      dependsOn: "workspace",
      reloadOnChange: ["asUser"],
      hidden: {
        $deps: ["workspace"],
        $condition: { workspace: { $exists: false } }
      }
    },
    {
      name: "downloadFormat",
      label: "Download Format",
      type: "select",
      required: false,
      defaultValue: "both",
      options: [
        { label: "URL and Content (recommended)", value: "both" },
        { label: "URL Only", value: "url" },
        { label: "Base64 Content Only", value: "base64" }
      ],
      tooltip: "Choose what to return: URL, base64 content, or both. 'Both' allows sending the file to other actions while keeping the URL available.",
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
      description: "The unique ID of the file in Slack",
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
      label: "File Title",
      type: "string",
      description: "The title/description of the file set by the uploader",
      example: "Q4 Report"
    },
    {
      name: "fileType",
      label: "File Type",
      type: "string",
      description: "The file extension or type (e.g., pdf, png, docx)",
      example: "pdf"
    },
    {
      name: "fileSize",
      label: "File Size (Bytes)",
      type: "number",
      description: "Size of the file in bytes",
      example: 1048576
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "The MIME type of the file",
      example: "application/pdf"
    },
    {
      name: "created",
      label: "Created Timestamp",
      type: "number",
      description: "Unix timestamp when the file was uploaded",
      example: 1640000000
    },
    {
      name: "createdAt",
      label: "Created Date",
      type: "string",
      description: "ISO 8601 formatted date when the file was created",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "userId",
      label: "Uploader User ID",
      type: "string",
      description: "The Slack user ID who uploaded the file",
      example: "U1234567890"
    },
    {
      name: "username",
      label: "Uploader Username",
      type: "string",
      description: "The username of the user who uploaded the file",
      example: "john.doe"
    },
    {
      name: "channels",
      label: "Shared in Channels",
      type: "array",
      description: "Array of channel IDs where this file is shared",
      example: ["C1234567890", "C0987654321"]
    },
    {
      name: "isPublic",
      label: "Is Public",
      type: "boolean",
      description: "Whether the file is public or private",
      example: false
    },
    {
      name: "downloadUrl",
      label: "Download URL",
      type: "string",
      description: "URL to download the file (available when format is 'url' or 'both'). Requires authentication.",
      example: "https://files.slack.com/files-pri/..."
    },
    {
      name: "permalink",
      label: "Permalink",
      type: "string",
      description: "Public permalink to view the file in Slack",
      example: "https://example.slack.com/files/U1234/F1234/file.pdf"
    },
    {
      name: "permalinkPublic",
      label: "Public Permalink",
      type: "string",
      description: "Publicly accessible permalink (if file is public)",
      example: "https://slack-files.com/..."
    },
    {
      name: "fileContent",
      label: "File Content (Base64)",
      type: "string",
      description: "Base64-encoded file content (available when format is 'base64' or 'both'). Can be passed to other actions like Gmail Send Email, Google Drive Upload, or any file upload action.",
      example: "JVBERi0xLjQKJeLjz9MK..."
    },
    {
      name: "thumbnail",
      label: "Thumbnail URL",
      type: "string",
      description: "URL to a thumbnail preview of the file (for images/videos)",
      example: "https://files.slack.com/files-tmb/..."
    },
    {
      name: "previewUrl",
      label: "Preview URL",
      type: "string",
      description: "URL to preview the file (for images)",
      example: "https://files.slack.com/files-pri/..."
    },
    {
      name: "isEditable",
      label: "Is Editable",
      type: "boolean",
      description: "Whether the file can be edited in Slack",
      example: false
    },
    {
      name: "commentsCount",
      label: "Comments Count",
      type: "number",
      description: "Number of comments on the file",
      example: 3
    }
  ]
}
