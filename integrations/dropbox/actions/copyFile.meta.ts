import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `copy_file` ActionMeta — Slice 3.DROPBOX-4.
 *
 * folderPath (UI-scope `dropbox:folders`, SOURCE folder) → fromPath
 * (`dropbox:files`) cascade. `toPath` is a free-text destination path.
 * Creates a copy — medium risk, not destructive.
 */
export const dropboxCopyFileMeta: ActionMeta = {
  key: "dropbox:copy_file",
  provider: "dropbox",
  type: "copy_file",
  displayName: "Copy File",
  description:
    "Copy a Dropbox file or folder to a new path. Pick the source from a folder (or type its path), then type the full destination path.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderPath",
      label: "Browse source folder (optional)",
      description:
        "Optional — pick a folder to populate the From picker below. Root-level items can't be listed here; type the From path manually.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Pick a folder to browse",
    },
    {
      name: "fromPath",
      label: "From (file/folder)",
      description:
        "Pick a file from the source folder, or type a full Dropbox path. Root-level paths must be typed manually.",
      type: "combobox",
      optionsSource: "dropbox:files",
      allowManualEntry: true,
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
    {
      name: "toPath",
      sensitivity: "recipient",
      label: "To (destination path)",
      description: "Full destination path, including the new name.",
      type: "text",
      required: true,
      placeholder: "/Backups/q1.pdf",
    },
    {
      name: "autorename",
      label: "Auto-rename on conflict",
      description: "Rename automatically instead of failing when something already exists at the destination.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Dropbox id of the copy." },
    { name: "name", type: "string", description: "Name of the copy.", sensitive: true },
    { name: "path", type: "string", description: "Destination Dropbox path.", sensitive: true },
    { name: "isFolder", type: "boolean", description: "True when the copied entry is a folder." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a copy of a file/folder in Dropbox. Recoverable by deleting the copy.",
};
