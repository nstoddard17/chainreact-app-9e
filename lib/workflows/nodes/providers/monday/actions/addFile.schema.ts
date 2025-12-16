import { NodeComponent } from "../../../types"

export const addFileActionSchema: NodeComponent = {
  type: "monday_action_add_file",
  title: "Add File to Column",
  description: "Upload and attach a file to a file column in a Monday.com item",
  icon: "FileUp" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "The unique ID of the uploaded file asset",
      example: "1234567890"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "The name of the uploaded file",
      example: "document.pdf"
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "string",
      description: "The URL to access the file in Monday.com",
      example: "https://files.monday.com/..."
    },
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the item the file was added to",
      example: "9876543210"
    },
    {
      name: "columnId",
      label: "Column ID",
      type: "string",
      description: "The ID of the file column",
      example: "files"
    },
    {
      name: "fileSize",
      label: "File Size",
      type: "number",
      description: "Size of the file in bytes",
      example: 102400
    },
    {
      name: "uploadedAt",
      label: "Uploaded At",
      type: "string",
      description: "Timestamp when the file was uploaded",
      example: "2024-01-15T10:30:00Z"
    }
  ],
  configSchema: [
    {
      name: "boardId",
      label: "Board",
      type: "select",
      dynamic: "monday_boards",
      required: true,
      loadOnMount: true,
      placeholder: "Select a board...",
      description: "The Monday.com board containing the item"
    },
    {
      name: "itemId",
      label: "Item",
      type: "select",
      dynamic: "monday_items",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select an item...",
      description: "The item to add the file to",
      supportsAI: true
    },
    {
      name: "columnId",
      label: "Column",
      type: "select",
      dynamic: "monday_columns",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select a column...",
      description: "The column to add the file to"
    },
    {
      name: "sourceType",
      label: "File Source",
      type: "select",
      required: true,
      defaultValue: "file",
      options: [
        { label: "Upload File", value: "file" },
        { label: "From URL", value: "url" },
        { label: "From Previous Node", value: "node" }
      ],
      description: "Choose how to provide the file for upload"
    },
    {
      name: "uploadedFiles",
      label: "Upload Files",
      type: "file",
      required: false,
      placeholder: "Choose files to upload...",
      accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.zip,.rar,.json,.xml,.html,.css,.js,.py,.mp4,.svg,.ai",
      maxSize: 500 * 1024 * 1024, // 500MB limit for Monday.com
      description: "Upload files to attach to the Monday.com item (max 500MB per file)",
      visibilityCondition: { field: "sourceType", operator: "equals", value: "file" }
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: false,
      placeholder: "https://example.com/file.pdf",
      description: "Direct URL to a publicly accessible file. The file will be downloaded and uploaded to Monday.com.",
      supportsAI: true,
      visibilityCondition: { field: "sourceType", operator: "equals", value: "url" }
    },
    {
      name: "fileFromNode",
      label: "File Variable",
      type: "text",
      required: false,
      placeholder: "{{node-id.file}}",
      description: "Variable containing file data from a previous node (e.g., from a Google Drive download or email attachment)",
      supportsAI: true,
      visibilityCondition: { field: "sourceType", operator: "equals", value: "node" }
    },
    {
      name: "fileName",
      label: "File Name (Optional)",
      type: "text",
      required: false,
      placeholder: "document.pdf",
      description: "Custom file name. If not provided, will use original file name.",
      supportsAI: true
    }
  ],
}
