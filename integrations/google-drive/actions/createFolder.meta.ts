import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:create_folder` — Slice 4.GDRIVE-META-2.
 * Mirrors `createFolder.schema.ts`. Write action (medium risk — recoverable
 * via Delete File).
 *
 * `parentFolderId` wires to the existing `google-drive:folders` resolver;
 * optional — Drive defaults to My Drive root when unset (or pass the literal
 * "root").
 */
export const googleDriveCreateFolderMeta: ActionMeta = {
  key: "google-drive:create_folder",
  provider: "google-drive",
  type: "create_folder",
  displayName: "Create Folder",
  description: "Create a new folder on Google Drive.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "name",
      label: "Folder Name",
      description: "Name of the new folder.",
      type: "text",
      required: true,
      placeholder: "Q3 Reports",
    },
    {
      name: "parentFolderId",
      label: "Parent Folder",
      description:
        "Folder to create the new folder inside. Leave empty for My Drive root.",
      type: "combobox",
      required: false,
      optionsSource: "google-drive:folders",
      placeholder: "My Drive root (or pick a folder)",
    },
  ],
  outputs: [
    { name: "folderId", type: "string", description: "The new folder's id." },
    { name: "name", type: "string", description: "The new folder's name." },
    {
      name: "parents",
      type: "array",
      description: "Parent folder ids (one entry — where the folder was created).",
    },
    { name: "webViewLink", type: "string", description: "Drive UI link to the folder (or null).", nullable: true },
    { name: "createdTime", type: "string", description: "ISO-8601 created time (or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 20,
  riskLevel: "medium",
  riskDescription: "Creates a new folder on Drive (recoverable — delete the folder to undo).",
};
