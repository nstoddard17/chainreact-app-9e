import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `delete_file` ActionMeta — Slice 3.DROPBOX-4.
 *
 * The one high-risk destructive action in the Dropbox surface:
 * isDestructive + requiresConfirmation + riskLevel high. folderPath
 * (UI-scope `dropbox:folders`) → path (`dropbox:files`) cascade.
 * Structural-only output (no deleted name / content echoed); the input
 * `path` echo is marked sensitive.
 */
export const dropboxDeleteFileMeta: ActionMeta = {
  key: "dropbox:delete_file",
  provider: "dropbox",
  type: "delete_file",
  displayName: "Delete File",
  description:
    "Delete a Dropbox file or folder. Dropbox moves it to trash (recoverable for ~30 days from the Dropbox UI), but ChainReact has no restore action — treat as permanent. Double-check the selected path.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderPath",
      label: "Browse folder (optional)",
      description:
        "Optional — pick a folder to populate the picker below. Root-level items can't be listed here; type their path manually.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Pick a folder to browse",
    },
    {
      name: "path",
      label: "File/folder to delete",
      description:
        "Pick a file from the selected folder, or type a full Dropbox path. Root-level paths must be typed manually. This deletes the path — confirm it carefully.",
      type: "combobox",
      optionsSource: "dropbox:files",
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "Always true on success." },
    { name: "path", type: "string", description: "Path that was deleted (echo of input).", sensitive: true },
    { name: "deletedAt", type: "string", description: "Client-synthesized deletion timestamp." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Deletes a file or folder. Dropbox keeps it in trash (recoverable ~30 days via the Dropbox UI), but ChainReact has no restore action — recovery requires manual action in Dropbox.",
};
