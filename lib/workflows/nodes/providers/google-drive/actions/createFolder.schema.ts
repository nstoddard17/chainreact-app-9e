import { NodeComponent } from "../../../types"

export const createFolderActionSchema: NodeComponent = {
  type: "google-drive:create_folder",
  title: "Create Folder",
  description: "Create a new folder in Google Drive for organizing files",
  icon: "FolderPlus" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive"],
  configSchema: [
    {
      name: "folderName",
      label: "Folder Name",
      type: "text",
      required: true,
      placeholder: "e.g., Client Documents, Project Files",
      supportsAI: true,
      description: "Name for the new folder"
    },
    {
      name: "parentFolderId",
      label: "Parent Folder (Optional)",
      type: "select",
      required: false,
      dynamic: "google-drive-folders",
      loadOnMount: true,
      placeholder: "Leave empty to create in My Drive root",
      description: "Where to create the folder"
    },
    {
      name: "description",
      label: "Folder Description (Optional)",
      type: "textarea",
      required: false,
      placeholder: "What this folder is for...",
      supportsAI: true,
      description: "Add a description to help identify this folder's purpose"
    },
    {
      name: "shareWithDomain",
      label: "Share with Organization",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Make folder accessible to everyone in your organization"
    }
  ],
  outputSchema: [
    {
      name: "folderId",
      label: "Folder ID",
      type: "string",
      description: "Unique identifier for the created folder"
    },
    {
      name: "folderName",
      label: "Folder Name",
      type: "string",
      description: "Name of the created folder"
    },
    {
      name: "folderUrl",
      label: "Folder URL",
      type: "string",
      description: "Direct link to open the folder"
    },
    {
      name: "createdTime",
      label: "Created At",
      type: "string",
      description: "ISO timestamp when folder was created"
    }
  ]
}
