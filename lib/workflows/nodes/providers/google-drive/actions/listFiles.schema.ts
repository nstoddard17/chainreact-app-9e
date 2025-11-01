import { NodeComponent } from "../../../types"

export const listFilesActionSchema: NodeComponent = {
  type: "google-drive:list_files",
  title: "List Files in Folder",
  description: "Retrieve all files and subfolders from a specific Google Drive folder with optional filtering",
  icon: "List" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive.readonly"],
  configSchema: [
    {
      name: "folderId",
      label: "Folder",
      type: "select",
      required: true,
      dynamic: "google-drive-folders",
      loadOnMount: true,
      description: "Select the folder to list files from"
    },
    {
      name: "includeSubfolders",
      label: "Include Files from Subfolders",
      type: "boolean",
      required: false,
      defaultValue: false,
      description: "Recursively list files from all nested subfolders"
    },
    {
      name: "fileTypeFilter",
      label: "Filter by Type (Optional)",
      type: "select",
      required: false,
      options: [
        { value: "all", label: "All Files and Folders" },
        { value: "files_only", label: "Files Only (no folders)" },
        { value: "folders_only", label: "Folders Only" },
        { value: "documents", label: "Documents Only (Docs, PDFs, etc.)" },
        { value: "images", label: "Images Only" },
        { value: "videos", label: "Videos Only" }
      ]
    },
    {
      name: "orderBy",
      label: "Sort By",
      type: "select",
      required: false,
      defaultValue: "name",
      options: [
        { value: "name", label: "Name (A-Z)" },
        { value: "name_desc", label: "Name (Z-A)" },
        { value: "modifiedTime", label: "Modified Date (Newest First)" },
        { value: "modifiedTime_desc", label: "Modified Date (Oldest First)" },
        { value: "createdTime", label: "Created Date (Newest First)" },
        { value: "folder", label: "Folders First, Then Files" }
      ]
    },
    {
      name: "limit",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 100,
      placeholder: "100",
      description: "Limit number of results (max 1000)"
    }
  ],
  outputSchema: [
    {
      name: "files",
      label: "Files",
      type: "array",
      description: "Array of files and folders"
    },
    {
      name: "fileCount",
      label: "File Count",
      type: "number",
      description: "Number of files returned"
    },
    {
      name: "folderCount",
      label: "Folder Count",
      type: "number",
      description: "Number of folders returned"
    },
    {
      name: "totalSize",
      label: "Total Size",
      type: "number",
      description: "Combined size of all files in bytes"
    }
  ]
}
