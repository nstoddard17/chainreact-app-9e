import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `create_folder` ActionMeta — Slice 3.DROPBOX-4.
 *
 * `path` is a NEW folder path the author types — a folder picker doesn't
 * fit (you're naming a folder that doesn't exist yet), so this stays a
 * text field (real product reason; not a resolver downgrade).
 */
export const dropboxCreateFolderMeta: ActionMeta = {
  key: "dropbox:create_folder",
  provider: "dropbox",
  type: "create_folder",
  displayName: "Create Folder",
  description:
    "Create a new folder in Dropbox at the given path. Type the full destination path (the folder is being created, so there is nothing to pick).",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "path",
      label: "New folder path",
      description: "Full path of the folder to create, including its name.",
      type: "text",
      required: true,
      placeholder: "/Reports/2026",
    },
    {
      name: "autorename",
      label: "Auto-rename on conflict",
      description: "Rename automatically instead of failing when a folder already exists at that path.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Dropbox folder id." },
    { name: "name", type: "string", description: "Folder name.", sensitive: true },
    { name: "path", type: "string", description: "Dropbox path of the created folder.", sensitive: true },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a folder in Dropbox. Recoverable by deleting the folder.",
};
