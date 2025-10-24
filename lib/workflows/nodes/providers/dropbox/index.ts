import { NodeComponent } from "../../types"
import { Upload, Download } from "lucide-react"

// Dropbox Triggers
const dropboxTriggerNewFile: NodeComponent = {
  type: "dropbox_trigger_new_file",
  title: "New File",
  description: "Triggers when a new file is added to a folder",
  icon: Upload,
  providerId: "dropbox",
  category: "Storage",
  isTrigger: true,
  producesOutput: true,
  requiredScopes: ["files.metadata.read"],
  configSchema: [
    {
      name: "path",
      label: "Folder to Watch",
      type: "select",
      dynamic: "dropbox-folders",
      loadOnMount: true,
      required: false,
      placeholder: "Select a folder or leave blank for root",
      description: "Choose which Dropbox folder should be monitored for new files. Leave empty to watch your entire Dropbox.",
      helperText: "Select a folder from your Dropbox account.",
    },
    {
      name: "fileType",
      label: "File Type Filter",
      type: "select",
      required: false,
      defaultValue: "any",
      options: [
        { value: "any", label: "Any file" },
        { value: "documents", label: "Documents" },
        { value: "images", label: "Images" },
        { value: "audio", label: "Audio" },
        { value: "video", label: "Video" },
        { value: "spreadsheets", label: "Spreadsheets" },
        { value: "presentations", label: "Presentations" },
        { value: "pdf", label: "PDF" },
        { value: "archives", label: "Archives" }
      ],
      description: "Limit the trigger to specific file categories. Select 'Any file' to capture everything."
    },
    {
      name: "includeSubfolders",
      label: "Include Subfolders",
      type: "boolean",
      defaultValue: true,
      description: "When enabled, new files created in subfolders will also trigger this workflow."
    }
  ]
}

// Dropbox Actions
const dropboxActionUploadFile: NodeComponent = {
  type: "dropbox_action_upload_file",
  title: "Upload File",
  description: "Upload a file to Dropbox from various sources",
  icon: Upload,
  providerId: "dropbox",
  requiredScopes: ["files.content.write"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    {
      name: "fileName",
      label: "File Name",
      type: "text",
      required: true,
      placeholder: "Enter file name (e.g., document.txt, report.pdf) - auto-filled when uploading files",
      description: "File name for the created file. Will be automatically populated when you upload files.",
      supportsAI: true
    },
    {
      name: "sourceType",
      label: "File Source",
      type: "select",
      required: true,
      defaultValue: "file",
      options: [
        { value: "file", label: "Upload File" },
        { value: "url", label: "From URL" },
        { value: "text", label: "Text Content" },
        { value: "node", label: "From Previous Node" }
      ],
      description: "Choose how to provide the file for upload"
    },
    {
      name: "uploadedFiles",
      label: "Upload Files",
      type: "file",
      required: false,
      placeholder: "Choose files to upload...",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.java,.cpp,.c,.md,.log",
      maxSize: 150 * 1024 * 1024, // 150MB limit for Dropbox
      description: "Upload files to create in Dropbox (max 150MB per file). Files will be stored and available for workflow execution.",
      visibilityCondition: { field: "sourceType", operator: "equals", value: "file" }
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: false,
      placeholder: "https://example.com/file.pdf",
      description: "Direct URL to a publicly accessible file (e.g., image, PDF, document). The file will be downloaded and uploaded to Dropbox.",
      visibilityCondition: { field: "sourceType", operator: "equals", value: "url" },
      supportsAI: true
    },
    {
      name: "fileContent",
      label: "Text Content",
      type: "textarea",
      required: false,
      placeholder: "Enter text content for the file",
      description: "Text content to create a text file. The file will be saved with the specified file name.",
      visibilityCondition: { field: "sourceType", operator: "equals", value: "text" },
      supportsAI: true
    },
    {
      name: "fileFromNode",
      label: "File Variable",
      type: "text",
      required: false,
      placeholder: "{{node-id.file}}",
      description: "Variable containing file data (base64, buffer, or file object) from a previous node. Use this for files generated or processed by other nodes in your workflow.",
      visibilityCondition: { field: "sourceType", operator: "equals", value: "node" },
      supportsAI: true
    },
    {
      name: "path",
      label: "Destination Folder",
      type: "combobox",
      dynamic: true,
      loadOnMount: true,
      creatable: true,
      required: false,
      placeholder: "Select or type a folder path",
      description: "Choose an existing folder or type a new folder name to create it. Leave empty for root folder.",
      helperText: "Tip: Type a new folder name to create it automatically",
      supportsAI: true
    }
  ],
}

const dropboxActionGetFile: NodeComponent = {
  type: "dropbox_action_get_file",
  title: "Get File",
  description: "Retrieve file details and download a file from Dropbox",
  icon: Download,
  providerId: "dropbox",
  requiredScopes: ["files.content.read", "files.metadata.read"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    {
      name: "path",
      label: "Folder",
      type: "select",
      dynamic: "dropbox-folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select a folder (optional)",
      description: "Choose a folder to browse files from"
    },
    {
      name: "filePath",
      label: "File",
      type: "select",
      dynamic: "dropbox-files",
      required: true,
      loadOnMount: true,
      placeholder: "Select a file",
      description: "Choose the file to retrieve",
      dependsOn: "path"
      // loadOnMount loads files from root on mount, dependsOn reloads when folder is selected
    },
    {
      name: "downloadContent",
      label: "Download File Content",
      type: "boolean",
      defaultValue: true,
      description: "When enabled, downloads the file content. When disabled, only retrieves file metadata."
    }
  ],
  outputSchema: [
    {
      name: "id",
      label: "File ID",
      type: "string",
      description: "The unique ID of the file"
    },
    {
      name: "name",
      label: "File Name",
      type: "string",
      description: "The name of the file"
    },
    {
      name: "size",
      label: "File Size",
      type: "number",
      description: "Size of the file in bytes"
    },
    {
      name: "path",
      label: "File Path",
      type: "string",
      description: "Full path to the file in Dropbox"
    },
    {
      name: "content",
      label: "File Content",
      type: "string",
      description: "The file content (base64 encoded if binary)"
    },
    {
      name: "modifiedAt",
      label: "Last Modified",
      type: "string",
      description: "When the file was last modified"
    },
    {
      name: "shareableUrl",
      label: "Shareable URL",
      type: "string",
      description: "Public shareable URL for the file"
    }
  ]
}

// Export all Dropbox nodes
export const dropboxNodes: NodeComponent[] = [
  // Triggers (1)
  dropboxTriggerNewFile,

  // Actions (2)
  dropboxActionUploadFile,
  dropboxActionGetFile,
]
