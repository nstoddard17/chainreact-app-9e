import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `download_file` ActionMeta — Slice 3.DROPBOX-4. FileRef producer.
 *
 * folderPath (UI-scope `dropbox:folders`) → path (`dropbox:files`) cascade.
 * Downloads from Dropbox and stages the bytes into V2 storage as a
 * FileRef(kind=v2_storage, provider="dropbox"). Bytes never enter the
 * action output (no base64 / raw bytes).
 *
 * Root caveat: the options route drops empty deps, so root-level files
 * can't be listed via the picker — type their path directly into the File
 * field.
 */
export const dropboxDownloadFileMeta: ActionMeta = {
  key: "dropbox:download_file",
  provider: "dropbox",
  type: "download_file",
  displayName: "Download File",
  description:
    "Download a file from Dropbox and stage it as a FileRef for downstream nodes. Pick a folder to browse its files, or type a full Dropbox file path. Returns a staged file reference — never raw bytes or base64.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderPath",
      label: "Browse folder (optional)",
      description:
        "Optional — pick a folder to populate the File picker below. Root-level files can't be listed here; type their path in the File field instead.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Pick a folder to browse",
    },
    {
      name: "path",
      label: "File",
      description:
        "Pick a file from the selected folder, or type a full Dropbox file path (e.g. /Reports/q1.pdf). Root-level files must be typed manually.",
      type: "combobox",
      optionsSource: "dropbox:files",
      allowManualEntry: true,
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description: "Staged FileRef (kind=v2_storage, provider='dropbox').",
      sensitive: true,
    },
    { name: "name", type: "string", description: "File name.", sensitive: true },
    { name: "path", type: "string", description: "Dropbox path of the file.", sensitive: true },
    { name: "sizeBytes", type: "number", description: "Downloaded size in bytes." },
    { name: "rev", type: "string", description: "Dropbox revision id (or null)." },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Reads a file out of Dropbox and stages it for downstream nodes (data export). No provider-side mutation.",
};
