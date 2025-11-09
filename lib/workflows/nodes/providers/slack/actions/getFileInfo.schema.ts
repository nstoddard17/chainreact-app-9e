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
      name: "fileId",
      label: "File ID",
      type: "text",
      required: true,
      placeholder: "F1234567890",
      tooltip: "The ID of the file to get information about"
    },
    {
      name: "includeComments",
      label: "Include Comments",
      type: "boolean",
      defaultValue: false,
      tooltip: "Include comments and reactions on the file"
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
