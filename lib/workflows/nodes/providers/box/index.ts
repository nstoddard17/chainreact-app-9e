import { NodeComponent } from "../../types"
import { Upload, MessageSquare, FolderPlus, Share, Download } from "lucide-react"

// Box Triggers
const boxTriggerNewFile: NodeComponent = {
  type: "box_trigger_new_file",
  title: "New file uploaded",
  description: "Triggers when a new file is uploaded to a folder",
  icon: Upload,
  providerId: "box",
  category: "Storage",
  isTrigger: true,
  comingSoon: true,
  requiredScopes: ["root_readwrite"],
}

const boxTriggerNewComment: NodeComponent = {
  type: "box_trigger_new_comment",
  title: "New comment on file",
  description: "Triggers when a new comment is added to a file",
  icon: MessageSquare,
  providerId: "box",
  category: "Storage",
  isTrigger: true,
  comingSoon: true,
  requiredScopes: ["root_readwrite"],
}

// Box Actions
const boxActionUploadFile: NodeComponent = {
  type: "box_action_upload_file",
  title: "Upload File",
  description: "Upload a file to Box",
  icon: Upload,
  providerId: "box",
  requiredScopes: ["root_readwrite"],
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
      name: "fileContent", 
      label: "File Content", 
      type: "textarea", 
      required: false,
      placeholder: "Enter file content (optional if uploading files)",
      description: "Text content for the file. Leave empty if uploading files."
    },
    { 
      name: "uploadedFiles", 
      label: "Upload Files", 
      type: "file", 
      required: false,
      placeholder: "Choose files to upload...",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.java,.cpp,.c,.md,.log",
      maxSize: 5 * 1024 * 1024 * 1024, // 5GB limit for Box
      description: "Upload files to create in Box. Files will be created with their original names and content. The file name field will be auto-populated."
    },
    {
      name: "path",
      label: "Destination Folder",
      type: "select",
      dynamic: "box-folders",
      required: false,
      placeholder: "Select a folder (optional, defaults to root)",
      description: "Choose the folder where the file should be uploaded. Leave empty to upload to root."
    },
  ]
}

const boxActionCreateFolder: NodeComponent = {
  type: "box_action_create_folder",
  title: "Create Folder",
  description: "Create a new folder in Box",
  icon: FolderPlus,
  providerId: "box",
  requiredScopes: ["root_readwrite"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    { name: "parentFolderId", label: "Parent Folder ID", type: "text", required: true, placeholder: "Enter parent folder ID" },
    { name: "folderName", label: "Folder Name", type: "text", required: true, placeholder: "Enter folder name" }
  ]
}

const boxActionShareFile: NodeComponent = {
  type: "box_action_share_file",
  title: "Share File",
  description: "Share a file from Box",
  icon: Share,
  providerId: "box",
  requiredScopes: ["root_readwrite"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    { name: "fileId", label: "File ID", type: "text", required: true, placeholder: "Enter file ID" },
    { name: "access", label: "Access Level", type: "select", required: true, defaultValue: "open", options: [
      { value: "open", label: "Open" },
      { value: "company", label: "Company" },
      { value: "collaborators", label: "Collaborators" }
    ]},
    { name: "expiresAt", label: "Expires At", type: "datetime", required: false }
  ]
}

const boxActionGetFile: NodeComponent = {
  type: "box_action_get_file",
  title: "Get File",
  description: "Retrieve file details and download a file from Box",
  icon: Download,
  providerId: "box",
  requiredScopes: ["root_readwrite"],
  category: "Storage",
  isTrigger: false,
  configSchema: [
    {
      name: "folderId",
      label: "Folder",
      type: "select",
      dynamic: "box-folders",
      required: false,
      loadOnMount: true,
      placeholder: "Select a folder (optional)",
      description: "Choose a folder to browse files from"
    },
    {
      name: "fileId",
      label: "File",
      type: "select",
      dynamic: "box-files",
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
      description: "Download URL for the file"
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

// Export all Box nodes
export const boxNodes: NodeComponent[] = [
  // Triggers (2)
  boxTriggerNewFile,
  boxTriggerNewComment,

  // Actions (4)
  boxActionUploadFile,
  boxActionCreateFolder,
  boxActionShareFile,
  boxActionGetFile,
]