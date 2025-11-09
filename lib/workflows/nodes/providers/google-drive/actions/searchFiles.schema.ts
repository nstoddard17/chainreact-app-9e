import { NodeComponent } from "../../../types"

export const searchFilesActionSchema: NodeComponent = {
  type: "google-drive:search_files",
  title: "Search Files",
  description: "Search for files and folders in Google Drive using advanced filters",
  icon: "Search" as any,
  providerId: "google-drive",
  category: "Google Drive",
  isTrigger: false,
  requiredScopes: ["https://www.googleapis.com/auth/drive.readonly"],
  configSchema: [
    {
      name: "searchMode",
      label: "Search Mode",
      type: "select",
      required: true,
      defaultValue: "simple",
      options: [
        { value: "simple", label: "Simple Search (by name)" },
        { value: "advanced", label: "Advanced Search (filters)" },
        { value: "query", label: "Custom Query (Google Drive API)" }
      ]
    },
    {
      name: "fileName",
      label: "File Name",
      type: "text",
      required: false,
      visibleWhen: { field: "searchMode", value: "simple" },
      placeholder: "e.g., budget, report, photo",
      supportsAI: true,
      description: "Search for files containing this text in the name"
    },
    {
      name: "exactMatch",
      label: "Exact Match",
      type: "boolean",
      required: false,
      defaultValue: false,
      visibleWhen: { field: "searchMode", value: "simple" },
      description: "Match the exact file name instead of partial matches"
    },
    {
      name: "fileType",
      label: "File Type",
      type: "select",
      required: false,
      visibleWhen: { field: "searchMode", value: "advanced" },
      options: [
        { value: "any", label: "Any Type" },
        { value: "application/vnd.google-apps.folder", label: "Folders" },
        { value: "application/vnd.google-apps.document", label: "Google Docs" },
        { value: "application/vnd.google-apps.spreadsheet", label: "Google Sheets" },
        { value: "application/vnd.google-apps.presentation", label: "Google Slides" },
        { value: "application/pdf", label: "PDF Files" },
        { value: "image/*", label: "Images" },
        { value: "video/*", label: "Videos" }
      ]
    },
    {
      name: "modifiedTime",
      label: "Modified",
      type: "select",
      required: false,
      visibleWhen: { field: "searchMode", value: "advanced" },
      options: [
        { value: "any", label: "Any Time" },
        { value: "today", label: "Today" },
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
        { value: "year", label: "This Year" }
      ]
    },
    {
      name: "owner",
      label: "Owner",
      type: "select",
      required: false,
      visibleWhen: { field: "searchMode", value: "advanced" },
      options: [
        { value: "any", label: "Any Owner" },
        { value: "me", label: "Owned by Me" },
        { value: "shared", label: "Shared with Me" }
      ]
    },
    {
      name: "customQuery",
      label: "Custom Query",
      type: "textarea",
      required: false,
      visibleWhen: { field: "searchMode", value: "query" },
      placeholder: "name contains 'invoice' and modifiedDate > '2024-01-01'",
      description: "Use Google Drive API query syntax for complex searches"
    },
    {
      name: "maxResults",
      label: "Maximum Results",
      type: "number",
      required: false,
      defaultValue: 50,
      placeholder: "50",
      description: "Limit number of results returned (max 1000)"
    }
  ],
  outputSchema: [
    {
      name: "files",
      label: "Files Found",
      type: "array",
      description: "Array of matching files"
    },
    {
      name: "totalCount",
      label: "Total Count",
      type: "number",
      description: "Number of files found"
    },
    {
      name: "hasMore",
      label: "Has More Results",
      type: "boolean",
      description: "Whether more results exist beyond the limit"
    }
  ]
}
