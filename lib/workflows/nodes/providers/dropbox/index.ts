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
      maxSize: 150 * 1024 * 1024, // 150MB limit for Dropbox
      description: "Upload files to create in Dropbox (max 150MB per file). Files will be stored and available for workflow execution.",
      conditional: { field: "sourceType", value: "file" }
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: false,
      placeholder: "https://example.com/file.pdf",
      description: "Direct URL to a publicly accessible file (e.g., image, PDF, document). The file will be downloaded and uploaded to Dropbox.",
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
      name: "path",
      label: "Destination Folder",
      type: "combobox",
      dynamic: true,
      loadOnMount: true,
      allowCustomValue: true,
      required: false,
      placeholder: "Select or type a folder path",
      description: "Choose an existing folder or type a new folder name to create it. Leave empty for root folder.",
      helperText: "Tip: Type a new folder name to create it automatically"
    },
  ],
}

// Export all Dropbox nodes
export const dropboxNodes: NodeComponent[] = [
  // Triggers (1)
  dropboxTriggerNewFile,

  // Actions (1 - consolidated upload file action)
  dropboxActionUploadFile,
]