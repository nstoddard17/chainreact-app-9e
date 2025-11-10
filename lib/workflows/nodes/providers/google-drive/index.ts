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
      // API VERIFICATION: Google Drive webhooks fire for ANY file creation in the watched folder.
      // The webhook payload includes file metadata (mimeType, name, size, owners, parents).
      // We implement client-side filtering by checking these properties in the webhook handler.
      // Supported filters: fileTypes, namePattern, excludeSubfolders, minFileSize, maxFileSize, createdByEmail
      // Docs: https://developers.google.com/drive/api/v3/push
      {
        name: "fileTypes",
        label: "File Types",
        type: "multi-select",
        required: false,
        dependsOn: "folderId",
        hidden: { $deps: ["folderId"], $condition: { folderId: { $exists: false } } },
        options: [
          { value: "application/pdf", label: "PDF" },
          { value: "image/*", label: "Images (All)" },
          { value: "image/png", label: "PNG Images" },
          { value: "image/jpeg", label: "JPEG Images" },
          { value: "application/vnd.google-apps.document", label: "Google Docs" },
          { value: "application/vnd.google-apps.spreadsheet", label: "Google Sheets" },
          { value: "application/vnd.google-apps.presentation", label: "Google Slides" },
          { value: "application/msword", label: "Word Documents" },
          { value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word Documents (.docx)" },
          { value: "application/vnd.ms-excel", label: "Excel Files" },
          { value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel Files (.xlsx)" },
          { value: "video/*", label: "Videos (All)" },
          { value: "audio/*", label: "Audio Files (All)" },
          { value: "text/plain", label: "Text Files" },
        ],
        placeholder: "All file types",
        tooltip: "Only trigger for specific file types. Leave empty for all files."
      },
      {
        name: "namePattern",
        label: "File Name Contains",
        type: "text",
        required: false,
        dependsOn: "folderId",
        hidden: { $deps: ["folderId"], $condition: { folderId: { $exists: false } } },
        placeholder: "e.g., invoice, report, 2025",
        tooltip: "Only trigger when file name contains this text (case-insensitive)"
      },
      {
        name: "excludeSubfolders",
        label: "Exclude Subfolders",
        type: "toggle",
        required: false,
        dependsOn: "folderId",
        hidden: { $deps: ["folderId"], $condition: { folderId: { $exists: false } } },
        defaultValue: false,
        tooltip: "If enabled, only trigger for files directly in the selected folder, not in subfolders"
      },
      {
        name: "minFileSize",
        label: "Minimum File Size (MB)",
        type: "number",
        required: false,
        dependsOn: "folderId",
        hidden: { $deps: ["folderId"], $condition: { folderId: { $exists: false } } },
        placeholder: "e.g., 1",
        tooltip: "Only trigger for files larger than this size in megabytes"
      },
      {
        name: "maxFileSize",
        label: "Maximum File Size (MB)",
        type: "number",
        required: false,
        dependsOn: "folderId",
        hidden: { $deps: ["folderId"], $condition: { folderId: { $exists: false } } },
        placeholder: "e.g., 100",
        tooltip: "Only trigger for files smaller than this size in megabytes"
      },
      {
        name: "createdByEmail",
        label: "Created By (Email)",
        type: "combobox",
        dynamic: "gmail-enhanced-recipients",
        required: false,
        dependsOn: "folderId",
        hidden: { $deps: ["folderId"], $condition: { folderId: { $exists: false } } },
        placeholder: "Select a contact or enter email...",
        searchable: true,
        allowCustomValue: true,
        tooltip: "Only trigger for files created by this specific user. Loads contacts and recent recipients from your Gmail account."
      },
    ],
    outputSchema: [
      { name: "fileId", label: "File ID", type: "string", description: "Unique identifier for the file" },
      { name: "fileName", label: "File Name", type: "string", description: "Name of the file" },
      { name: "mimeType", label: "File Type", type: "string", description: "MIME type of the file" },
      { name: "fileSize", label: "File Size", type: "number", description: "Size of the file in bytes" },
      { name: "webViewLink", label: "View Link", type: "string", description: "URL to view the file in browser" },
      { name: "webContentLink", label: "Download Link", type: "string", description: "URL to download the file" },
      { name: "createdTime", label: "Created Time", type: "string", description: "ISO timestamp when file was created" },
      { name: "modifiedTime", label: "Modified Time", type: "string", description: "ISO timestamp when file was last modified" },
      { name: "ownerName", label: "Owner Name", type: "string", description: "Name of the file owner" },
      { name: "ownerEmail", label: "Owner Email", type: "string", description: "Email of the file owner" }
    ]
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
    outputSchema: [
      { name: "folderId", label: "Folder ID", type: "string", description: "Unique identifier for the new folder" },
      { name: "folderName", label: "Folder Name", type: "string", description: "Name of the new folder" },
      { name: "parentFolderId", label: "Parent Folder ID", type: "string", description: "ID of the parent folder" },
      { name: "webViewLink", label: "View Link", type: "string", description: "URL to view the folder in browser" },
      { name: "createdTime", label: "Created Time", type: "string", description: "ISO timestamp when folder was created" },
      { name: "modifiedTime", label: "Modified Time", type: "string", description: "ISO timestamp when folder was last modified" },
      { name: "ownerName", label: "Owner Name", type: "string", description: "Name of the folder owner" },
      { name: "ownerEmail", label: "Owner Email", type: "string", description: "Email of the folder owner" }
    ]
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
    outputSchema: [
      { name: "fileId", label: "File ID", type: "string", description: "Unique identifier for the file" },
      { name: "fileName", label: "File Name", type: "string", description: "Name of the updated file" },
      { name: "mimeType", label: "File Type", type: "string", description: "MIME type of the file" },
      { name: "fileSize", label: "File Size", type: "number", description: "Current size of the file in bytes" },
      { name: "webViewLink", label: "View Link", type: "string", description: "URL to view the file in browser" },
      { name: "webContentLink", label: "Download Link", type: "string", description: "URL to download the file" },
      { name: "modifiedTime", label: "Modified Time", type: "string", description: "ISO timestamp when file was last modified" },
      { name: "modifiedBy", label: "Modified By", type: "string", description: "Email of the user who modified the file" },
      { name: "version", label: "Version", type: "string", description: "Current version number of the file" }
    ]
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
    outputSchema: [
      {
        name: "fileId",
        label: "File ID",
        type: "string",
        description: "Unique identifier for the uploaded file"
      },
      {
        name: "fileName",
        label: "File Name",
        type: "string",
        description: "Name of the uploaded file"
      },
      {
        name: "fileUrl",
        label: "File URL",
        type: "string",
        description: "Direct link to view the file in Google Drive"
      },
      {
        name: "downloadUrl",
        label: "Download URL",
        type: "string",
        description: "Direct download link for the file"
      },
      {
        name: "mimeType",
        label: "File Type",
        type: "string",
        description: "MIME type of the uploaded file"
      },
      {
        name: "size",
        label: "File Size",
        type: "number",
        description: "Size of the file in bytes"
      },
      {
        name: "createdTime",
        label: "Created At",
        type: "string",
        description: "ISO timestamp when file was uploaded"
      },
      {
        name: "file",
        label: "File Object",
        type: "object",
        description: "Complete file object for use in subsequent nodes (can be used as attachment)"
      }
    ]
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
        type: "google_drive_preview",
        required: false,
        description: "Toggle to show a preview of the selected file",
        dependsOn: "fileId"
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