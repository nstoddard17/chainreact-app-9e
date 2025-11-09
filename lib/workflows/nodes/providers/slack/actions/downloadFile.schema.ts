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
      name: "fileId",
      label: "File ID",
      type: "text",
      required: true,
      placeholder: "F1234567890",
      tooltip: "The ID of the file to download (from file upload trigger or file info action)"
    },
    {
      name: "downloadFormat",
      label: "Download Format",
      type: "select",
      required: false,
      defaultValue: "url",
      options: [
        { label: "URL Only (for external download)", value: "url" },
        { label: "Base64 Content (for inline use)", value: "base64" }
      ],
      tooltip: "Choose whether to return a download URL or the file content as base64"
    }
  ],
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "The ID of the downloaded file",
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
      name: "downloadUrl",
      label: "Download URL",
      type: "string",
      description: "URL to download the file (when format is 'url')",
      example: "https://files.slack.com/..."
    },
    {
      name: "fileContent",
      label: "File Content (Base64)",
      type: "string",
      description: "Base64-encoded file content (when format is 'base64')",
      example: "JVBERi0xLjQKJeLjz9MK..."
    },
    {
      name: "expiresAt",
      label: "URL Expires At",
      type: "string",
      description: "When the download URL expires (for URL format)",
      example: "2024-01-15T10:30:00Z"
    }
  ]
}
