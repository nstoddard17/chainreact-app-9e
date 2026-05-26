import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:get_file` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `getFile.schema.ts` (+ the UI-scope `parentItemId`). Read action
 * (low risk).
 *
 * Picker cascade: `parentItemId` (UI-scope, optional — microsoft-onedrive:folders)
 * → `itemId` (microsoft-onedrive:items, dependsOn parentItemId). `parentItemId`
 * is optional so an `itemId` wired from the file_changed trigger still
 * validates. `downloadUrl` output is sensitive.
 *
 * **FileRef deferred:** the runtime returns the Graph `downloadUrl` as a
 * string (not a V2 FileRef) → `producesFileRef:false`.
 */
export const microsoftOneDriveGetFileMeta: ActionMeta = {
  key: "microsoft-onedrive:get_file",
  provider: "microsoft-onedrive",
  type: "get_file",
  displayName: "Get File",
  description:
    "Get a OneDrive item's metadata (file or folder), including a short-lived download URL for files. Does not return the file bytes.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "parentItemId",
      label: "Folder",
      description:
        "Pick a folder to populate the item picker below. Optional — leave empty if the item id comes from an upstream step (e.g. the file-changed trigger).",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      placeholder: "Pick a folder",
    },
    {
      name: "itemId",
      label: "Item",
      description: "The file or folder to read. Pick a folder first, or paste an item id.",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-onedrive:items",
      dependsOn: "parentItemId",
      placeholder: "Select a folder first, or paste an item id",
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "DriveItem id." },
    { name: "name", type: "string", description: "Item name." },
    { name: "kind", type: "string", description: '"file" or "folder".' },
    { name: "size", type: "number", description: "Bytes (files)." },
    { name: "mimeType", type: "string", description: "MIME type (files; null for folders)." },
    { name: "webUrl", type: "string", description: "Item URL." },
    {
      name: "downloadUrl",
      type: "string",
      description: "Short-lived pre-signed download URL (files; null for folders).",
      sensitive: true,
    },
    { name: "parentReference", type: "object", description: "Parent drive/folder reference." },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "low",
  riskDescription: "Reads item metadata — no provider-side mutation.",
};
