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
  description: "Upload a file to OneDrive",
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
      maxSize: 100 * 1024 * 1024, // 100MB limit for OneDrive
      description: "Upload files to create in OneDrive. Files will be created with their original names and content. The file name field will be auto-populated."
    },
    {
      name: "folderId",
      label: "Destination Folder",
      type: "select",
      dynamic: "onedrive-folders",
      required: false,
      placeholder: "Select a folder (optional, defaults to root)",
      description: "Choose the folder where the file should be uploaded. Leave empty to upload to root."
    },
  ],
}

const onedriveActionUploadFileFromUrl: NodeComponent = {
  type: "onedrive_action_upload_file_from_url",
  title: "Upload File from URL",
  description: "Upload a file from a URL to OneDrive",
  icon: Upload,
  providerId: "onedrive",
  category: "Storage",
  isTrigger: false,
  configSchema: [
    { name: "fileUrl", label: "File URL", type: "text", required: true, placeholder: "Publicly accessible URL of the file" },
    { name: "fileName", label: "File Name", type: "text", required: false, placeholder: "e.g., report.pdf (optional - will use original filename if blank)" },
    {
      name: "folderId",
      label: "Destination Folder",
      type: "select",
      dynamic: "onedrive-folders",
      required: false,
      placeholder: "Select a folder (optional, defaults to root)",
    },
  ],
}

// Export all OneDrive nodes
export const onedriveNodes: NodeComponent[] = [
  // Triggers (3 - note: 2 have same type but different titles)
  onedriveTriggerNewFile,
  onedriveTriggerFileModified,
  onedriveTriggerFileModifiedInFolder,
  
  // Actions (2)
  onedriveActionUploadFile,
  onedriveActionUploadFileFromUrl,
]