import { NodeComponent } from "../../types"
import { Upload } from "lucide-react"

// Dropbox Triggers
const dropboxTriggerNewFile: NodeComponent = {
  type: "dropbox_trigger_new_file",
  title: "New File",
  description: "Triggers when a new file is added to a folder",
  icon: Upload,
  providerId: "dropbox",
  category: "Storage",
  isTrigger: true,
}

// Dropbox Actions  
const dropboxActionUploadFile: NodeComponent = {
  type: "dropbox_action_upload_file",
  title: "Upload File",
  description: "Upload a file to Dropbox",
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
      maxSize: 150 * 1024 * 1024, // 150MB limit for Dropbox
      description: "Upload files to create in Dropbox. Files will be created with their original names and content. The file name field will be auto-populated."
    },
    {
      name: "path",
      label: "Destination Folder",
      type: "select",
      dynamic: "dropbox-folders",
      required: false,
      placeholder: "Select a folder (optional, defaults to root)",
      description: "Choose the folder where the file should be uploaded. Leave empty to upload to root."
    },
  ],
}

const dropboxActionUploadFileFromUrl: NodeComponent = {
  type: "dropbox_action_upload_file_from_url",
  title: "Upload File from URL",
  description: "Upload a file from a URL to Dropbox",
  icon: Upload,
  providerId: "dropbox",
  category: "Storage",
  isTrigger: false,
  configSchema: [
    { name: "fileUrl", label: "File URL", type: "text", required: true, placeholder: "Publicly accessible URL of the file" },
    { name: "fileName", label: "File Name", type: "text", required: false, placeholder: "e.g., report.pdf (optional - will use original filename if blank)" },
    {
      name: "path",
      label: "Destination Folder",
      type: "select",
      dynamic: "dropbox-folders",
      required: false,
      placeholder: "Select a folder (optional, defaults to root)",
    },
  ],
}

// Export all Dropbox nodes
export const dropboxNodes: NodeComponent[] = [
  // Triggers (1)
  dropboxTriggerNewFile,
  
  // Actions (2)
  dropboxActionUploadFile,
  dropboxActionUploadFileFromUrl,
]