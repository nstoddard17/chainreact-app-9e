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
      description: "The unique ID of the uploaded file",
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
      description: "The URL to access the file",
      example: "https://files.monday.com/..."
    },
    {
      name: "fileSize",
      label: "File Size",
      type: "number",
      description: "Size of the file in bytes",
      example: "102400"
    },
    {
      name: "itemId",
      label: "Item ID",
      type: "string",
      description: "The ID of the item the file was added to",
      example: "9876543210"
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
      label: "File Column",
      type: "select",
      dynamic: "monday_file_columns",
      dynamicParent: "boardId",
      dependsOn: "boardId",
      hidden: {
        $deps: ["boardId"],
        $condition: { boardId: { $exists: false } }
      },
      required: true,
      placeholder: "Select a file column...",
      description: "The file column to add the file to"
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "text",
      required: true,
      placeholder: "https://example.com/file.pdf",
      description: "URL of the file to upload (must be publicly accessible)",
      supportsAI: true
    }
  ],
}
