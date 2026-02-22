import { NodeComponent } from "../../../types"

export const moveFileActionSchema: NodeComponent = {
  type: "google-drive:move_file",
  title: "Move File/Folder",
  description: "Move a file or folder to a different location in Google Drive",
  icon: "FolderInput" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive"],
  configSchema: [
    {
      name: "fileId",
      label: "File or Folder to Move",
      type: "combobox",
      required: true,
      dynamic: "google-drive-files-and-folders",
      loadOnMount: true,
      searchable: true,
      description: "Select the file or folder to move. Folders are shown with their full path hierarchy."
    },
    {
      name: "destinationFolderId",
      label: "Destination Folder",
      type: "select",
      required: true,
      dynamic: "google-drive-folders",
      loadOnMount: true,
      description: "Where to move the file/folder"
    },
    {
      name: "removeFromAllParents",
      label: "Remove from All Current Locations",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "If disabled, file will exist in multiple locations (Drive allows this)"
    }
  ],
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "ID of the moved file"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "Name of the moved file"
    },
    {
      name: "newLocation",
      label: "New Location",
      type: "string",
      description: "Path of the destination folder"
    },
    {
      name: "success",
      label: "Success",
      type: "boolean",
      description: "Whether the move completed successfully"
    }
  ]
}
