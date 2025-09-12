import { File, FolderPlus, Upload } from "lucide-react"
import { NodeComponent } from "../../types"

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
        conditional: { field: "sourceType", value: "file" }
      },
      { 
        name: "fileUrl", 
        label: "File URL", 
        type: "text", 
        required: false,
        placeholder: "https://example.com/file.pdf",
        description: "Direct URL to a publicly accessible file (e.g., image, PDF, document). The file will be downloaded and uploaded to Google Drive.",
        conditional: { field: "sourceType", value: "url" }
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
        dynamic: "google-drive-folders",
        required: false,
        placeholder: "Select a folder (optional, defaults to root)",
        loadOnMount: true, // Load folders immediately when form opens to show names instead of IDs
      },
    ],
  },
]