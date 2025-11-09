import { NodeComponent } from "../../../types"

const SLACK_UPLOAD_FILE_METADATA = {
  key: "slack_action_upload_file",
  name: "Upload File",
  description: "Upload a file to a Slack channel or DM"
}

export const uploadFileActionSchema: NodeComponent = {
  type: SLACK_UPLOAD_FILE_METADATA.key,
  title: "Upload File",
  description: SLACK_UPLOAD_FILE_METADATA.description,
  icon: "Upload" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "slack",
  testable: true,
  requiredScopes: ["files:write"],
  category: "Communication",
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "The unique ID of the uploaded file",
      example: "F1234567890"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "The name of the uploaded file",
      example: "report.pdf"
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "string",
      description: "URL to view/download the file",
      example: "https://files.slack.com/files-pri/T1234/F1234/report.pdf"
    },
    {
      name: "fileSize",
      label: "File Size",
      type: "number",
      description: "Size of the file in bytes",
      example: 1024000
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "The MIME type of the file",
      example: "application/pdf"
    },
    {
      name: "channelIds",
      label: "Channel IDs",
      type: "array",
      description: "Array of channels where the file was shared",
      example: ["C1234567890"]
    },
    {
      name: "uploadedAt",
      label: "Uploaded At",
      type: "string",
      description: "When the file was uploaded",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the file was uploaded successfully",
      example: true
    }
  ],
  configSchema: [
    {
      name: "workspace",
      label: "Workspace",
      type: "select",
      dynamic: "slack-workspaces",
      required: true,
      loadOnMount: true,
      placeholder: "Select Slack workspace",
      description: "Your Slack workspace (used for authentication)"
    },
    {
      name: "channels",
      label: "Channels",
      type: "multiselect",
      dynamic: "slack-channels",
      required: true,
      dependsOn: "workspace",
      placeholder: "Select channels to share the file...",
      description: "Channels or DMs to share the file in",
      tooltip: "You can select multiple channels. The file will be uploaded and shared in all selected channels."
    },
    {
      name: "fileSource",
      label: "File Source",
      type: "select",
      required: true,
      options: [
        { value: "url", label: "From URL" },
        { value: "content", label: "From Text Content" },
        { value: "base64", label: "From Base64 Data" }
      ],
      defaultValue: "url",
      description: "How to provide the file data",
      tooltip: "URL: Download from a public URL. Content: Create a text file from content. Base64: Upload binary data encoded as base64.",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      }
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: true,
      placeholder: "https://example.com/file.pdf",
      supportsAI: true,
      description: "URL of the file to upload",
      tooltip: "Must be a publicly accessible URL. Slack will download the file from this URL.",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      },
      visibleWhen: {
        field: "fileSource",
        value: "url"
      }
    },
    {
      name: "content",
      label: "File Content",
      type: "textarea",
      required: true,
      rows: 10,
      placeholder: "Enter the text content for the file...",
      supportsAI: true,
      description: "Text content for the file",
      tooltip: "This content will be saved as a text file. Use 'File Name' below to set the extension (.txt, .md, .csv, etc.).",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      },
      visibleWhen: {
        field: "fileSource",
        value: "content"
      }
    },
    {
      name: "base64Data",
      label: "Base64 File Data",
      type: "textarea",
      required: true,
      rows: 6,
      placeholder: "JVBERi0xLjQKJeLjz9MK...",
      supportsAI: true,
      description: "Base64-encoded file data",
      tooltip: "Provide the file data encoded as base64. Use this for binary files like images, PDFs, etc.",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      },
      visibleWhen: {
        field: "fileSource",
        value: "base64"
      }
    },
    {
      name: "fileName",
      label: "File Name",
      type: "text",
      required: true,
      placeholder: "report.pdf",
      supportsAI: true,
      description: "Name for the uploaded file (include extension)",
      tooltip: "Include the file extension to ensure proper file type detection (e.g., .pdf, .png, .csv, .txt).",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      }
    },
    {
      name: "title",
      label: "File Title (Optional)",
      type: "text",
      required: false,
      placeholder: "Q1 2024 Sales Report",
      supportsAI: true,
      description: "Optional title displayed in Slack (defaults to file name)",
      tooltip: "A human-readable title shown in Slack. If not provided, the file name will be used.",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      }
    },
    {
      name: "initialComment",
      label: "Initial Comment (Optional)",
      type: "textarea",
      required: false,
      rows: 4,
      placeholder: "Here's the latest report...",
      supportsAI: true,
      description: "Optional message to post with the file",
      tooltip: "This message will appear as a comment attached to the file upload.",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      }
    },
    {
      name: "threadTs",
      label: "Thread Timestamp (Optional)",
      type: "text",
      required: false,
      placeholder: "{{trigger.threadTs}} or 1234567890.123456",
      supportsAI: true,
      description: "Upload the file as a reply in a thread",
      tooltip: "If provided, the file will be uploaded as part of this thread. Leave empty to upload as a new message.",
      dependsOn: "channels",
      hidden: {
        $deps: ["channels"],
        $condition: { channels: { $exists: false } }
      }
    }
  ]
}
