import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `download_file` ActionMeta — Slice 3.MONDAY-6. FileRef producer.
 *
 * board → item → fileId cascade. `columnId` uses monday:file_columns
 * (includes the __item_files__ sentinel for the item's general files
 * area). `fileId` uses monday:item_files (deps itemId + columnId).
 * Stages bytes → FileRef(kind=v2_storage, provider="monday").
 */
export const mondayDownloadFileMeta: ActionMeta = {
  key: "monday:download_file",
  provider: "monday",
  type: "download_file",
  displayName: "Download File",
  description:
    "Download a file from a Monday item and stage it as a FileRef for downstream nodes. Pick a file column (or the item's general files area) and optionally a specific file.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "boardId",
      label: "Board",
      description: "Used to populate the item + file-column pickers.",
      type: "combobox",
      optionsSource: "monday:boards",
      required: true,
      placeholder: "Search boards…",
    },
    {
      name: "itemId",
      label: "Item",
      type: "combobox",
      optionsSource: "monday:items",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
    {
      name: "columnId",
      label: "File column",
      description:
        "A file column, or the item's general files area (__item_files__), offered by the picker.",
      type: "combobox",
      optionsSource: "monday:file_columns",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
    {
      name: "fileId",
      label: "File (optional)",
      description: "Pick a specific file. Leave empty to take the first file found.",
      type: "combobox",
      optionsSource: "monday:item_files",
      dependsOn: "columnId",
      required: false,
      placeholder: "First file when empty",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description: "Staged FileRef (kind=v2_storage, provider='monday').",
      sensitive: true,
    },
    { name: "fileId", type: "string", description: "Monday asset id of the downloaded file." },
    { name: "fileName", type: "string", description: "File name.", sensitive: true },
    { name: "mimeType", type: "string", description: "Mime type (application/octet-stream)." },
    { name: "sizeBytes", type: "number", description: "Downloaded size in bytes." },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 240,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Reads a file out of Monday and stages it for downstream nodes (data export). No provider-side mutation.",
};
