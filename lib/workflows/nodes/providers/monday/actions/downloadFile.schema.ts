import { NodeComponent } from "../../../types"

export const downloadFileActionSchema: NodeComponent = {
  type: "monday_action_download_file",
  title: "Download File",
  description: "Download a file from a Monday.com item's file column",
  icon: "Download" as any,
  isTrigger: false,
  providerId: "monday",
  testable: true,
  category: "Productivity",
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "The unique ID of the file",
      example: "1234567890"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "The name of the file",
      example: "document.pdf"
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "string",
      description: "The download URL for the file",
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
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "The file's MIME type",
      example: "application/pdf"
    },
    {
      name: "fileData",
      label: "File Data (Base64)",
      type: "string",
      description: "Base64-encoded file content",
      example: "JVBERi0xLjQKJeLjz9MK..."
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
      description: "The item containing the file",
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
      description: "The file column to download from"
    },
    {
      name: "fileId",
      label: "File ID (Optional)",
      type: "text",
      required: false,
      placeholder: "Latest file...",
      description: "Optionally specify a file ID (defaults to most recent file)",
      supportsAI: true
    }
  ],
}
