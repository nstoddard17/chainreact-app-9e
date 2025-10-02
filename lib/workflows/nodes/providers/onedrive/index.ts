import { NodeComponent } from "../../types"
import {
  Upload,
  FileText,
  Download
} from "lucide-react"

// OneDrive Triggers
const onedriveTriggerNewFile: NodeComponent = {
  type: "onedrive_trigger_new_file",
  title: "New file or folder",
  description: "Triggers when a new file or folder is created",
  icon: Upload,
  providerId: "onedrive",
  category: "Storage",
  isTrigger: true,
  requiredScopes: ["Files.ReadWrite"],
  producesOutput: true,
  configSchema: [
    {
      name: "folderId",
      label: "Folder to Watch",
      type: "select",
      dynamic: "onedrive-folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select a folder or leave blank for root",
      description: "Choose a specific OneDrive folder to monitor. Leave empty to watch the root.",
      uiTab: "basic"
    },
    {
      name: "watchType",
      label: "Watch For",
      type: "select",
      required: false,
      defaultValue: "any",
      options: [
        { value: "any", label: "Files and folders" },
        { value: "files", label: "Files only" },
        { value: "folders", label: "Folders only" }
      ],
      description: "Limit the trigger to files, folders, or both.",
      uiTab: "basic"
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
      description: "Only applies when watching for files.",
      conditional: { field: "watchType", value: "files" },
      uiTab: "advanced"
    },
    {
      name: "includeSubfolders",
      label: "Include Subfolders",
      type: "boolean",
      defaultValue: true,
      description: "When enabled, new items created in subfolders will also trigger.",
      uiTab: "advanced"
    }
    ,
    {
      name: "triggerOnUpdates",
      label: "Trigger on updates (new versions)",
      type: "boolean",
      defaultValue: false,
      description: "Enable to trigger when a new version of an existing file is uploaded (in addition to new files/folders).",
      uiTab: "advanced"
    }
  ]
}

const onedriveTriggerFileModified: NodeComponent = {
  type: "onedrive_trigger_file_modified",
  title: "File modified",
  description: "Triggers when a file is modified",
  icon: FileText,
  providerId: "onedrive",
  category: "Storage",
  isTrigger: true,
  requiredScopes: ["Files.ReadWrite"],
  producesOutput: true,
  configSchema: [
    {
      name: "folderId",
      label: "Folder to Watch",
      type: "select",
      dynamic: "onedrive-folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select a folder or leave blank for all folders",
      description: "Limit the trigger to a specific folder. Leave empty to monitor the entire drive.",
      uiTab: "basic"
    },
    {
      name: "fileId",
      label: "Specific File",
      type: "select",
      dynamic: "onedrive-files",
      required: false,
      placeholder: "Optional: select a specific file",
      description: "Choose a single file to monitor for modifications.",
      dependsOn: "folderId",
      uiTab: "basic"
    },
    {
      name: "fileNameFilter",
      label: "File Name Filter",
      type: "text",
      required: false,
      placeholder: "e.g. report, Q1, draft",
      description: "Only trigger when the file name contains this text.",
      uiTab: "advanced"
    },
    {
      name: "fileType",
      label: "File Type",
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
      description: "Filter modifications by file type category.",
      uiTab: "advanced"
    },
    {
      name: "includeSubfolders",
      label: "Include Subfolders",
      type: "boolean",
      defaultValue: true,
      description: "When enabled, modifications inside subfolders will also trigger.",
      uiTab: "advanced"
    }
  ]
}

// OneDrive Actions
const onedriveActionUploadFile: NodeComponent = {
  type: "onedrive_action_upload_file",
  title: "Upload File",
  description: "Upload a file to OneDrive from various sources",
  icon: Upload,
  providerId: "onedrive",
  requiredScopes: ["Files.ReadWrite"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    {
      name: "fileName",
      label: "File Name",
      type: "text",
      required: true,
      placeholder: "Enter file name (e.g., document.txt, report.pdf) - auto-filled when uploading files",
      description: "File name for the created file. Will be automatically populated when you upload files."
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
      maxSize: 100 * 1024 * 1024, // 100MB limit for OneDrive
      description: "Upload files to create in OneDrive (max 100MB per file). Files will be stored and available for workflow execution.",
      conditional: { field: "sourceType", value: "file" }
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: false,
      placeholder: "https://example.com/file.pdf",
      description: "Direct URL to a publicly accessible file (e.g., image, PDF, document). The file will be downloaded and uploaded to OneDrive.",
      conditional: { field: "sourceType", value: "url" }
    },
    {
      name: "fileContent",
      label: "Text Content",
      type: "textarea",
      required: false,
      placeholder: "Enter text content for the file",
      description: "Text content to create a text file. The file will be saved with the specified file name.",
      conditional: { field: "sourceType", value: "text" }
    },
    {
      name: "fileFromNode",
      label: "File Variable",
      type: "text",
      required: false,
      placeholder: "{{node-id.output.file}}",
      description: "Variable containing file data (base64, buffer, or file object) from a previous node. Use this for files generated or processed by other nodes in your workflow.",
      conditional: { field: "sourceType", value: "node" }
    },
    {
      name: "folderId",
      label: "Destination Folder",
      type: "select",
      dynamic: "onedrive-folders",
      required: false,
      placeholder: "Select a folder (optional, defaults to root)",
      description: "Choose the folder where the file should be uploaded. Leave empty to upload to root.",
      loadOnMount: true
    },
  ],
}

const onedriveActionGetFile: NodeComponent = {
  type: "onedrive_action_get_file",
  title: "Get File",
  description: "Retrieve file details and download a file from OneDrive",
  icon: Download,
  providerId: "onedrive",
  requiredScopes: ["Files.Read"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    {
      name: "folderId",
      label: "Folder",
      type: "select",
      dynamic: "onedrive-folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select a folder (optional)",
      description: "Choose a folder to browse files from"
    },
    {
      name: "fileId",
      label: "File",
      type: "select",
      dynamic: "onedrive-files",
      required: true,
      placeholder: "Select a file",
      description: "Choose the file to retrieve",
      dependsOn: "folderId"
      // NOTE: Do NOT use loadOnMount with dependsOn - it will load automatically when parent changes
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
      name: "url",
      label: "File URL",
      type: "string",
      description: "Direct download URL for the file"
    },
    {
      name: "content",
      label: "File Content",
      type: "string",
      description: "The file content (base64 encoded if binary)"
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "The MIME type of the file"
    },
    {
      name: "modifiedAt",
      label: "Last Modified",
      type: "string",
      description: "When the file was last modified"
    }
  ]
}

// Export all OneDrive nodes
export const onedriveNodes: NodeComponent[] = [
  // Triggers
  onedriveTriggerNewFile,
  onedriveTriggerFileModified,

  // Actions
  onedriveActionUploadFile,
  onedriveActionGetFile,
]