import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:create_folder` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `createFolder.schema.ts`. Write action (medium risk).
 *
 * `parentItemId` is a REAL optional field (where the folder is created;
 * root if empty) → `microsoft-onedrive:folders`, no dep. The runtime sets
 * conflictBehavior "fail" (no silent rename).
 */
export const microsoftOneDriveCreateFolderMeta: ActionMeta = {
  key: "microsoft-onedrive:create_folder",
  provider: "microsoft-onedrive",
  type: "create_folder",
  displayName: "Create Folder",
  description:
    "Create a new folder in OneDrive. Fails if a folder of the same name already exists.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "parentItemId",
      label: "Parent Folder",
      description:
        "Where to create the folder. Leave empty for the drive root. Pick a folder, or paste a folder item id.",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      allowManualEntry: true,
      placeholder: "Drive root (or pick a folder)",
    },
    {
      name: "name",
      label: "Folder Name",
      description: "The new folder's name.",
      type: "text",
      required: true,
      placeholder: "e.g. Q3 Reports",
    },
  ],
  outputs: [
    { name: "itemId", type: "string", description: "The new folder's DriveItem id." },
    { name: "name", type: "string", description: "Folder name." },
    { name: "webUrl", type: "string", description: "Folder URL." },
    { name: "parentReference", type: "object", description: "Parent drive/folder reference." },
    { name: "childCount", type: "number", description: "Direct child count (0 for a new folder)." },
    { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
    { name: "lastModifiedDateTime", type: "string", description: "ISO-8601 modified." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "medium",
  riskDescription: "Creates a folder (recoverable — delete the folder to undo).",
};
