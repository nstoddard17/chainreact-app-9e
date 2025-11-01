import { File, FolderPlus, Upload, Download, Share2, Copy, FolderInput, Trash2, Search, List, Info } from "lucide-react"
import { NodeComponent } from "../../types"

// Import new action schemas
import { shareFileActionSchema } from "./actions/shareFile.schema"
import { copyFileActionSchema } from "./actions/copyFile.schema"
import { moveFileActionSchema } from "./actions/moveFile.schema"
import { deleteFileActionSchema } from "./actions/deleteFile.schema"
import { createFolderActionSchema } from "./actions/createFolder.schema"
import { searchFilesActionSchema } from "./actions/searchFiles.schema"
import { listFilesActionSchema } from "./actions/listFiles.schema"
import { getFileMetadataActionSchema } from "./actions/getFileMetadata.schema"

// Apply icons to new action schemas
const shareFile: NodeComponent = {
  ...shareFileActionSchema,
  icon: Share2
}

const copyFile: NodeComponent = {
  ...copyFileActionSchema,
  icon: Copy
}

const moveFile: NodeComponent = {
  ...moveFileActionSchema,
  icon: FolderInput
}

const deleteFile: NodeComponent = {
  ...deleteFileActionSchema,
  icon: Trash2
}

const createFolder: NodeComponent = {
  ...createFolderActionSchema,
  icon: FolderPlus
}

const searchFiles: NodeComponent = {
  ...searchFilesActionSchema,
  icon: Search
}

const listFiles: NodeComponent = {
  ...listFilesActionSchema,
  icon: List
}

const getFileMetadata: NodeComponent = {
  ...getFileMetadataActionSchema,
  icon: Info
}

export const googleDriveNodes: NodeComponent[] = [
  {
    type: "google-drive:new_file_in_folder",
    title: "New File in Folder",
    description: "Triggers when a new file is added to a folder",
    icon: File,
    isTrigger: true,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "folderId",
        label: "Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: true,
        loadOnMount: true, // Load folders immediately when form opens to show names instead of IDs
      },
    ],
  },
  {
    type: "google-drive:new_folder_in_folder",
    title: "New Folder in Folder",
    description: "Triggers when a new folder is created inside a specific folder in Google Drive.",
    icon: FolderPlus,
    isTrigger: true,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "folderId",
        label: "Parent Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: true,
        loadOnMount: true, // Load folders immediately when form opens to show names instead of IDs
      },
    ],
  },
  {
    type: "google-drive:file_updated",
    title: "File Updated",
    description: "Triggers when a file in a specific folder is updated",
    icon: File,
    isTrigger: true,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "fileId",
        label: "File",
        type: "select",
        dynamic: "google-drive-files",
        required: true,
        loadOnMount: true,
      },
    ],
  },
  {
    type: "google-drive:create_file",
    title: "Upload File",
    description: "Creates a new file in Google Drive.",
    icon: Upload,
    isTrigger: false,
    providerId: "google-drive",
    category: "Google Drive",
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
        maxSize: 25 * 1024 * 1024, // 25MB limit for Google Drive
        description: "Upload files to create in Google Drive (max 25MB per file). Files will be stored and available for workflow execution.",
        visibilityCondition: { field: "sourceType", operator: "equals", value: "file" }
      },
      { 
        name: "fileUrl", 
        label: "File URL", 
        type: "text", 
        required: false,
        placeholder: "https://example.com/file.pdf",
        description: "Direct URL to a publicly accessible file (e.g., image, PDF, document). The file will be downloaded and uploaded to Google Drive.",
        visibilityCondition: { field: "sourceType", operator: "equals", value: "url" }
      },
      { 
        name: "fileFromNode", 
        label: "File Variable", 
        type: "text", 
        required: false,
        placeholder: "{{node-id.file}}",
        description: "Variable containing file data (base64, buffer, or file object) from a previous node. Use this for files generated or processed by other nodes in your workflow.",
        visibilityCondition: { field: "sourceType", operator: "equals", value: "node" }
      },
      {
        name: "folderId",
        label: "Destination Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
        loadOnMount: true, // Load folders immediately when form opens to show names instead of IDs
      },
    ],
  },
  {
    type: "google-drive:get_file",
    title: "Get File",
    description: "Retrieve a file from Google Drive",
    icon: Download,
    isTrigger: false,
    providerId: "google-drive",
    category: "Google Drive",
    producesOutput: true,
    configSchema: [
      {
        name: "folderId",
        label: "Folder",
        type: "select",
        dynamic: "google-drive-folders",
        required: false,
        placeholder: "Select a folder (optional, shows all files if not selected)",
        loadOnMount: true,
        description: "Choose a folder to browse files from"
      },
      {
        name: "fileId",
        label: "File",
        type: "select",
        dynamic: "google-drive-files",
        required: true,
        placeholder: "Select a file",
        dependsOn: "folderId",
        loadOnMount: true, // Load all files initially
        description: "Select the file to retrieve"
      },
      {
        name: "filePreview",
        label: "File Preview",
        type: "textarea",
        required: false,
        placeholder: "File preview will appear here after selection...",
        description: "Preview of the selected file",
        rows: 10,
        disabled: true,
        dynamic: true, // This field loads dynamic content
        dependsOn: "fileId" // Reload when fileId changes
      }
    ],
    outputSchema: [
      {
        name: "file",
        label: "File",
        type: "object",
        description: "The complete file object ready for use as an attachment (includes content, filename, mimeType, and size properties)"
      },
      { 
        name: "fileName", 
        label: "File Name", 
        type: "string", 
        description: "The name of the file (for convenience)" 
      }
    ]
  },
  // New schema-based actions
  shareFile,
  copyFile,
  moveFile,
  deleteFile,
  createFolder,
  searchFiles,
  listFiles,
  getFileMetadata
]