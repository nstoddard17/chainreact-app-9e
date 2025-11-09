import { NodeComponent } from "../../../types"

export const fileUploadedTriggerSchema: NodeComponent = {
  type: "slack_trigger_file_uploaded",
  title: "New File Uploaded",
  description: "Triggers when a file is uploaded to a channel or workspace",
  icon: "Upload" as any, // Will be resolved in index file
  providerId: "slack",
  category: "Communication",
  isTrigger: true,
  producesOutput: true,
  requiredScopes: ["files:read"],
  configSchema: [
    {
      name: "channel",
      label: "Channel (Optional)",
      type: "select",
      required: false,
      dynamic: "slack-channels",
      loadOnMount: true,
      placeholder: "All channels",
      description: "Optional: Filter to a specific channel. Leave empty to watch all file uploads in the workspace.",
      tooltip: "Select a specific channel to monitor, or leave empty to trigger on any file upload in any channel you have access to."
    },
    {
      name: "fileTypes",
      label: "File Types (Optional)",
      type: "multi-select",
      required: false,
      options: [
        { label: "All Files", value: "all" },
        { label: "Images (jpg, png, gif, etc.)", value: "images" },
        { label: "Documents (pdf, doc, txt, etc.)", value: "documents" },
        { label: "Spreadsheets (xls, csv, etc.)", value: "spreadsheets" },
        { label: "Videos (mp4, mov, etc.)", value: "videos" },
        { label: "Audio (mp3, wav, etc.)", value: "audio" },
        { label: "Code (js, py, java, etc.)", value: "code" },
        { label: "Archives (zip, tar, etc.)", value: "archives" }
      ],
      defaultValue: ["all"],
      placeholder: "All file types",
      description: "Optional: Filter by file type. Select specific types or leave as 'All Files'.",
      tooltip: "Choose which types of files should trigger the workflow. Leave as 'All Files' to trigger on any upload."
    }
  ],
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
      example: "document.pdf"
    },
    {
      name: "fileType",
      label: "File Type",
      type: "string",
      description: "The MIME type of the file",
      example: "application/pdf"
    },
    {
      name: "fileSize",
      label: "File Size",
      type: "number",
      description: "The size of the file in bytes",
      example: 1024000
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "string",
      description: "URL to view/download the file",
      example: "https://files.slack.com/files-pri/..."
    },
    {
      name: "fileUrlPrivate",
      label: "Private File URL",
      type: "string",
      description: "Private download URL (requires authentication)",
      example: "https://files.slack.com/files-pri/..."
    },
    {
      name: "fileThumbUrl",
      label: "Thumbnail URL",
      type: "string",
      description: "URL to file thumbnail (for images/videos)",
      example: "https://files.slack.com/files-tmb/..."
    },
    {
      name: "userId",
      label: "Uploader User ID",
      type: "string",
      description: "The ID of the user who uploaded the file",
      example: "U1234567890"
    },
    {
      name: "userName",
      label: "Uploader Name",
      type: "string",
      description: "The display name of the user who uploaded the file",
      example: "John Doe"
    },
    {
      name: "channelId",
      label: "Channel ID",
      type: "string",
      description: "The ID of the channel where the file was uploaded",
      example: "C1234567890"
    },
    {
      name: "channelName",
      label: "Channel Name",
      type: "string",
      description: "The name of the channel where the file was uploaded",
      example: "general"
    },
    {
      name: "timestamp",
      label: "Upload Timestamp",
      type: "string",
      description: "When the file was uploaded",
      example: "2024-01-15T10:30:00Z"
    },
    {
      name: "title",
      label: "File Title",
      type: "string",
      description: "The title/description of the file (if provided)",
      example: "Q1 Report"
    },
    {
      name: "initialComment",
      label: "Initial Comment",
      type: "string",
      description: "The message/comment posted with the file",
      example: "Here's the latest report"
    },
    {
      name: "isPublic",
      label: "Is Public",
      type: "boolean",
      description: "Whether the file is publicly accessible",
      example: false
    },
    {
      name: "mode",
      label: "File Mode",
      type: "string",
      description: "How the file is shared (hosted, external, snippet, post)",
      example: "hosted"
    }
  ]
}
