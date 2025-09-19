import { NodeComponent } from "../../types"
import {
  Upload,
  FileText
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
}

const onedriveTriggerFileModifiedInFolder: NodeComponent = {
  type: "onedrive_trigger_file_modified",
  title: "File Modified in Folder",
  description: "Triggers when a file is modified in a specific folder.",
  icon: Upload,
  providerId: "onedrive",
  category: "Storage",
  isTrigger: true,
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

// Export all OneDrive nodes
export const onedriveNodes: NodeComponent[] = [
  // Triggers (3 - note: 2 have same type but different titles)
  onedriveTriggerNewFile,
  onedriveTriggerFileModified,
  onedriveTriggerFileModifiedInFolder,

  // Actions (1 - consolidated upload file action)
  onedriveActionUploadFile,
]