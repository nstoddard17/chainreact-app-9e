import { NodeComponent } from "../../../types"

export const deleteFileActionSchema: NodeComponent = {
  type: "google-drive:delete_file",
  title: "Delete File/Folder",
  description: "Permanently delete a file or folder from Google Drive (moves to trash or permanently deletes)",
  icon: "Trash2" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive"],
  configSchema: [
    {
      name: "fileId",
      label: "File or Folder to Delete",
      type: "select",
      required: true,
      dynamic: "google-drive-files",
      loadOnMount: true,
      description: "Select the item to delete"
    },
    {
      name: "permanentDelete",
      label: "Permanently Delete",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "If enabled, bypasses trash and permanently deletes (cannot be recovered!). If disabled, moves to trash."
    }
  ],
  outputSchema: [
    {
      name: "fileId",
      label: "Deleted File ID",
      type: "string",
      description: "ID of the deleted file"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "Name of the deleted file"
    },
    {
      name: "deletionType",
      label: "Deletion Type",
      type: "string",
      description: "Whether file was trashed or permanently deleted"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether deletion was successful"
    },
    {
      name: "deletedAt",
      label: "Deleted At",
      type: "string",
      description: "ISO timestamp when deletion occurred"
    }
  ]
}
