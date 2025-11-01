import { NodeComponent } from "../../../types"

export const getFileMetadataActionSchema: NodeComponent = {
  type: "google-drive:get_file_metadata",
  title: "Get File Metadata",
  description: "Retrieve detailed information about a file including owner, permissions, sharing status, and properties",
  icon: "Info" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
  configSchema: [
    {
      name: "fileId",
      label: "File or Folder",
      type: "select",
      required: true,
      dynamic: "google-drive-files",
      loadOnMount: true,
      description: "Select the file to get metadata for"
    },
    {
      name: "includePermissions",
      label: "Include Permission Details",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Include information about who has access to this file"
    },
    {
      name: "includeOwner",
      label: "Include Owner Information",
      type: "boolean",
      required: false,
      defaultValue: true,
      description: "Include details about the file owner"
    }
  ],
  outputSchema: [
    {
      name: "fileId",
      label: "File ID",
      type: "string",
      description: "Unique identifier for the file"
    },
    {
      name: "fileName",
      label: "File Name",
      type: "string",
      description: "Name of the file"
    },
    {
      name: "mimeType",
      label: "MIME Type",
      type: "string",
      description: "File type (e.g., application/pdf, image/jpeg)"
    },
    {
      name: "size",
      label: "File Size",
      type: "number",
      description: "Size in bytes"
    },
    {
      name: "createdTime",
      label: "Created At",
      type: "string",
      description: "ISO timestamp when file was created"
    },
    {
      name: "modifiedTime",
      label: "Last Modified",
      type: "string",
      description: "ISO timestamp of last modification"
    },
    {
      name: "webViewLink",
      label: "View Link",
      type: "string",
      description: "URL to view the file in browser"
    },
    {
      name: "webContentLink",
      label: "Download Link",
      type: "string",
      description: "Direct download URL"
    },
    {
      name: "owners",
      label: "Owners",
      type: "array",
      description: "List of file owners"
    },
    {
      name: "permissions",
      label: "Permissions",
      type: "array",
      description: "List of who has access and their permission levels"
    },
    {
      name: "shared",
      label: "Is Shared",
      type: "boolean",
      description: "Whether the file is shared with others"
    },
    {
      name: "starred",
      label: "Is Starred",
      type: "boolean",
      description: "Whether the file is starred"
    },
    {
      name: "trashed",
      label: "Is Trashed",
      type: "boolean",
      description: "Whether the file is in trash"
    }
  ]
}
