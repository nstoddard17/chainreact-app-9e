import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `move_file` ActionMeta — Slice 3.DROPBOX-4.
 *
 * folderPath (UI-scope `dropbox:folders`, SOURCE folder) → fromPath
 * (`dropbox:files`) cascade. `toPath` is a free-text destination path
 * (the target doesn't exist yet, so there's nothing to pick).
 * Move/rename is recoverable — not destructive.
 */
export const dropboxMoveFileMeta: ActionMeta = {
  key: "dropbox:move_file",
  provider: "dropbox",
  type: "move_file",
  displayName: "Move File",
  description:
    "Move or rename a Dropbox file or folder. Pick the source from a folder (or type its path), then type the full destination path.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderPath",
      label: "Source folder (for file picker)",
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
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
    {
      name: "toPath",
      label: "To (destination path)",
      description: "Full destination path, including the new name.",
      type: "text",
      required: true,
      placeholder: "/Archive/q1.pdf",
    },
    {
      name: "autorename",
      label: "Auto-rename on conflict",
      description: "Rename automatically instead of failing when something already exists at the destination.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Dropbox id of the moved entry." },
    { name: "name", type: "string", description: "Name at the destination.", sensitive: true },
    { name: "path", type: "string", description: "Destination Dropbox path.", sensitive: true },
    { name: "isFolder", type: "boolean", description: "True when the moved entry is a folder." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Moves or renames a file/folder in Dropbox. Recoverable by moving it back.",
};
