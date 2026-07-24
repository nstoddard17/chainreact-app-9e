import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:get_file` — Slice 4.ONEDRIVE-META-3,
 * `itemId` picker reworked in ONEDRIVE-GETFILE-DISCOVERY. Read action (low risk).
 *
 * `itemId` is a FLAT file picker (`microsoft-onedrive:files`) that finds files
 * directly — root files first, then a bounded one-level folder descent — so it
 * surfaces a real file without first drilling into a folder (the old
 * `folders → items` cascade missed root files and files past the first folder).
 * The field still accepts a pasted item id or one wired from the file_changed
 * trigger (file OR folder). The schema keeps `parentItemId` as an
 * optional / handler-ignored field for backward compatibility with configs
 * persisted under the old cascade. `downloadUrl` output is sensitive.
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
      name: "itemId",
      label: "File",
      description:
        "The file to read. Pick from your files, or paste/wire an item id (file or folder, e.g. from the file-changed trigger).",
      type: "combobox",
      required: true,
      optionsSource: "microsoft-onedrive:files",
      allowManualEntry: true,
      placeholder: "Select a file, or paste an item id",
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "DriveItem id." },
    { name: "name", type: "string", description: "Item name." },
    { name: "kind", type: "string", description: '"file" or "folder".' },
    // Handler returns each of these as null when Graph omits them (folders, or a
    // sparse response) -> runtime-nullable.
    { name: "size", type: "number", description: "Bytes (files; or null).", nullable: true },
    { name: "mimeType", type: "string", description: "MIME type (files; null for folders).", nullable: true },
    { name: "webUrl", type: "string", description: "Item URL (or null).", nullable: true },
    {
      name: "downloadUrl",
      type: "string",
      description: "Short-lived pre-signed download URL (files; null for folders).",
      sensitive: true,
      nullable: true,
    },
    { name: "parentReference", type: "object", description: "Parent drive/folder reference (or null).", nullable: true },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created (or null).", nullable: true },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified (or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "low",
  riskDescription: "Reads item metadata — no provider-side mutation.",
};
