import { NodeComponent } from "../../types"
import { Upload, Download, Search } from "lucide-react"

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
  ],
  outputSchema: [
    {
      name: "id",
      label: "File ID",
      type: "string",
      description: "Unique identifier for the new file"
    },
    {
      name: "name",
      label: "File Name",
      type: "string",
      description: "Name of the new file"
    },
    {
      name: "path",
      label: "File Path",
      type: "string",
      description: "Full path to the file in Dropbox"
    },
    {
      name: "size",
      label: "File Size",
      type: "number",
      description: "Size of the file in bytes"
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "MIME type of the file"
    },
    {
      name: "serverModified",
      label: "Server Modified Time",
      type: "string",
      description: "ISO timestamp when the file was added to Dropbox"
    },
    {
      name: "clientModified",
      label: "Client Modified Time",
      type: "string",
      description: "ISO timestamp when the file was last modified on client"
    },
    {
      name: "rev",
      label: "Revision",
      type: "string",
      description: "Unique revision identifier for the file"
    },
    {
      name: "isDownloadable",
      label: "Is Downloadable",
      type: "boolean",
      description: "Whether the file can be downloaded"
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
  outputSchema: [
    {
      name: "id",
      label: "File ID",
      type: "string",
      description: "Unique identifier for the uploaded file"
    },
    {
      name: "name",
      label: "File Name",
      type: "string",
      description: "Name of the uploaded file"
    },
    {
      name: "path",
      label: "File Path",
      type: "string",
      description: "Full path to the file in Dropbox"
    },
    {
      name: "size",
      label: "File Size",
      type: "number",
      description: "Size of the file in bytes"
    },
    {
      name: "serverModified",
      label: "Server Modified Time",
      type: "string",
      description: "ISO timestamp when the file was uploaded to Dropbox"
    },
    {
      name: "rev",
      label: "Revision",
      type: "string",
      description: "Unique revision identifier for the file"
    },
    {
      name: "contentHash",
      label: "Content Hash",
      type: "string",
      description: "Hash of the file content for verification"
    },
    {
      name: "shareableUrl",
      label: "Shareable URL",
      type: "string",
      description: "URL to share the file"
    }
  ]
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

const dropboxActionFindFiles: NodeComponent = {
  type: "dropbox_action_find_files",
  title: "Find Files",
  description: "Search for files in Dropbox with filters and return matching results",
  icon: Search,
  providerId: "dropbox",
  requiredScopes: ["files.metadata.read", "files.content.read"],
  category: "Storage",
  isTrigger: false,
  producesOutput: true,
  configSchema: [
    // === BASIC SEARCH ===
    {
      name: "path",
      label: "Folder",
      type: "select",
      dynamic: "dropbox-folders",
      required: true,
      loadOnMount: true,
      placeholder: "Select a folder to search",
      description: "The folder to search in. Will search subfolders by default."
    },
    {
      name: "searchQuery",
      label: "Search Term",
      type: "text",
      required: false,
      placeholder: "report.pdf",
      description: "Search for files by name. Leave empty to return all files in the folder.",
      supportsAI: true
    },
    {
      name: "includeSubfolders",
      label: "Include Subfolders",
      type: "boolean",
      defaultValue: true,
      description: "Search within subfolders of the selected folder. Disable to search only the top level."
    },

    // === FILTERS (Optional) ===
    {
      name: "fileType",
      label: "File Type Filter",
      type: "select",
      required: false,
      defaultValue: "any",
      options: [
        { value: "any", label: "Any file type" },
        { value: "folder", label: "Folders only" },
        { value: "file", label: "Files only" },
        { value: "image", label: "Images (jpg, png, gif, etc.)" },
        { value: "video", label: "Videos (mp4, avi, mov, etc.)" },
        { value: "audio", label: "Audio (mp3, wav, etc.)" },
        { value: "document", label: "Documents (pdf, doc, txt, etc.)" },
        { value: "spreadsheet", label: "Spreadsheets (xlsx, csv, etc.)" },
        { value: "presentation", label: "Presentations (pptx, key, etc.)" },
        { value: "archive", label: "Archives (zip, rar, tar, etc.)" }
      ],
      description: "Filter results by file type category"
    },
    {
      name: "modifiedAfter",
      label: "Modified After",
      type: "select",
      required: false,
      options: [
        { value: "", label: "Any time" },
        { value: "last 7 days", label: "Last 7 days" },
        { value: "last 30 days", label: "Last 30 days" },
        { value: "last 90 days", label: "Last 90 days" },
        { value: "last 6 months", label: "Last 6 months" },
        { value: "last year", label: "Last year" },
        { value: "this year", label: "This year" },
        { value: "custom", label: "Custom date..." }
      ],
      placeholder: "Select a time range",
      description: "Filter files by when they were last modified. Select 'Custom date...' to enter a specific date (YYYY-MM-DD) or variable.",
      supportsAI: true
    },
    {
      name: "modifiedAfterCustom",
      label: "Custom Date",
      type: "date",
      required: false,
      description: "Select a specific date or use a variable from a previous node.",
      supportsAI: true,
      visibilityCondition: { field: "modifiedAfter", operator: "equals", value: "custom" }
    },
    {
      name: "modifiedBefore",
      label: "Modified Before",
      type: "select",
      required: false,
      options: [
        { value: "", label: "Any time" },
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "last 7 days", label: "Last 7 days" },
        { value: "last 30 days", label: "Last 30 days" },
        { value: "last month", label: "Last month" },
        { value: "this month", label: "This month" },
        { value: "custom", label: "Custom date..." }
      ],
      placeholder: "Select a time range",
      description: "Filter files by when they were last modified. Select 'Custom date...' to enter a specific date (YYYY-MM-DD) or variable.",
      supportsAI: true
    },
    {
      name: "modifiedBeforeCustom",
      label: "Custom Date",
      type: "date",
      required: false,
      description: "Select a specific date or use a variable from a previous node.",
      supportsAI: true,
      visibilityCondition: { field: "modifiedBefore", operator: "equals", value: "custom" }
    },

    // === RESULTS SETTINGS ===
    {
      name: "sortBy",
      label: "Sort By",
      type: "select",
      required: false,
      defaultValue: "modified_desc",
      options: [
        { value: "modified_desc", label: "Modified Date (Newest First)" },
        { value: "modified_asc", label: "Modified Date (Oldest First)" },
        { value: "name_asc", label: "Name (A-Z)" },
        { value: "name_desc", label: "Name (Z-A)" },
        { value: "size_desc", label: "Size (Largest First)" },
        { value: "size_asc", label: "Size (Smallest First)" }
      ],
      description: "How to sort the results"
    },
    {
      name: "limit",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      description: "Maximum files to return (1-1000). If more files match, check the 'Has More Results' output. Default: 100"
    },

    // === ADVANCED OPTIONS ===
    {
      name: "downloadContent",
      label: "Download File Content",
      type: "boolean",
      defaultValue: false,
      description: "⚠️ Download the actual file data as base64. Use when you need to process file contents or upload to another service. Limited to 20 files or 100MB total to prevent memory/timeout issues. If disabled, returns only file metadata (name, size, path, etc.)."
    }
  ],
  outputSchema: [
    {
      name: "files",
      label: "Files",
      type: "array",
      description: "Array of files matching the search criteria. Each file contains: id, name, path, size, modifiedAt, isFolder, and content (if downloaded)"
    },
    {
      name: "totalCount",
      label: "Total Count",
      type: "number",
      description: "Total number of files found"
    },
    {
      name: "hasMore",
      label: "Has More Results",
      type: "boolean",
      description: "Whether there are more results beyond the limit"
    },
    {
      name: "searchQuery",
      label: "Search Query Used",
      type: "string",
      description: "The search query that was used"
    },
    {
      name: "folderPath",
      label: "Folder Path Searched",
      type: "string",
      description: "The folder path that was searched"
    }
  ]
}

// Export all Dropbox nodes
export const dropboxNodes: NodeComponent[] = [
  // Triggers (1)
  dropboxTriggerNewFile,

  // Actions (3)
  dropboxActionUploadFile,
  dropboxActionGetFile,
  dropboxActionFindFiles,
]
