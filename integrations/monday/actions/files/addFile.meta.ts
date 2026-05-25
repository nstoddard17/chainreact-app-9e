import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Monday `add_file` ActionMeta — Slice 3.MONDAY-6. FileRef consumer.
 *
 * board → item AND board → file-column cascades. `file` is a FileRef
 * input. provider_url FileRefs are rejected at runtime (stage bytes
 * first); the description calls that out.
 */
export const mondayAddFileMeta: ActionMeta = {
  key: "monday:add_file",
  provider: "monday",
  type: "add_file",
  displayName: "Add File",
  description:
    "Upload a file to a Monday item's file column. Source is a FileRef from an upstream download/staging action. FileRef(kind=provider_url) is not supported — stage bytes first (e.g. monday:download_file, gmail:get_attachment).",
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
        "A file-typed column on the board. Upload targets a real file column — the item's general files area (__item_files__) is not a valid upload target.",
      type: "combobox",
      optionsSource: "monday:file_columns",
      dependsOn: "boardId",
      required: true,
      placeholder: "Select a board first",
    },
    {
      name: "file",
      label: "File",
      description: "Upstream FileRef to upload. Insert a {{nodeId.file}} token from a producer.",
      type: "file",
      required: true,
      placeholder: "Paste a {{...}} FileRef token",
    },
    {
      name: "filename",
      label: "Filename (override)",
      type: "text",
      required: false,
      placeholder: "Defaults to the FileRef's name",
    },
  ],
  outputs: [
    { name: "fileId", type: "string", description: "Monday asset id of the uploaded file." },
    { name: "fileName", type: "string", description: "Stored file name.", sensitive: true },
    { name: "fileUrl", type: "string", description: "Monday asset URL.", sensitive: true },
    { name: "itemId", type: "string", description: "Item id (echo)." },
    { name: "columnId", type: "string", description: "File column id (echo)." },
    { name: "sizeBytes", type: "number", description: "Uploaded size in bytes." },
    { name: "uploadedAt", type: "string", description: "Client-synthesized upload timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 230,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Uploads a file to a Monday item — visible to board members. Recoverable by removing the file in Monday.",
};
