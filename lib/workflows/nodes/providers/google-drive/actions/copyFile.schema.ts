import { NodeComponent } from "../../../types"

export const copyFileActionSchema: NodeComponent = {
  type: "google-drive:copy_file",
  title: "Copy File",
  description: "Create a copy of a Google Drive file in the same or different folder",
  icon: "Copy" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive"],
  configSchema: [
    {
      name: "fileId",
      label: "File to Copy",
      type: "select",
      required: true,
      dynamic: "google-drive-files",
      loadOnMount: true,
      description: "Select the file to copy"
    },
    {
      name: "newName",
      label: "New File Name",
      type: "text",
      required: false,
      placeholder: "Leave empty to append 'Copy of' to original name",
      supportsAI: true,
      description: "Name for the copied file (optional)"
    },
    {
      name: "destinationFolderId",
      label: "Destination Folder",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      loadOnMount: true,
      placeholder: "Leave empty to copy to same folder",
      description: "Where to place the copied file"
    }
  ],
  outputSchema: [
    {
      name: "fileId",
      label: "New File ID",
      type: "string",
      description: "ID of the copied file"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "Name of the copied file"
    },
    {
      name: "fileUrl",
      label: "File URL",
      type: "string",
      description: "Direct link to the copied file"
    },
    {
      name: "mimeType",
      label: "File Type",
      type: "string",
      description: "MIME type of the file"
    },
    {
      name: "createdTime",
      label: "Created At",
      type: "string",
      description: "ISO timestamp when copy was created"
    }
  ]
}
