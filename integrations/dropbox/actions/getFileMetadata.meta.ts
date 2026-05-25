import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `get_file_metadata` ActionMeta — Slice 3.DROPBOX-4. Pure read.
 *
 * folderPath (UI-scope `dropbox:folders`) → path (`dropbox:files`) cascade.
 * Works for files or folders. Root-level paths must be typed manually.
 */
export const dropboxGetFileMetadataMeta: ActionMeta = {
  key: "dropbox:get_file_metadata",
  provider: "dropbox",
  type: "get_file_metadata",
  displayName: "Get File Metadata",
  description:
    "Read the metadata (name, path, size, revision, timestamps, content hash) of a Dropbox file or folder. Pick a folder to browse, or type a full path.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderPath",
      label: "Folder (for file picker)",
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
        "Pick a file from the selected folder, or type a full Dropbox path (file or folder). Root-level paths must be typed manually.",
      type: "combobox",
      optionsSource: "dropbox:files",
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Dropbox id." },
    { name: "name", type: "string", description: "File/folder name.", sensitive: true },
    { name: "path", type: "string", description: "Dropbox path.", sensitive: true },
    { name: "isFolder", type: "boolean", description: "True when the entry is a folder." },
    { name: "sizeBytes", type: "number", description: "Size in bytes (or null for folders)." },
    { name: "rev", type: "string", description: "Dropbox revision id (or null)." },
    { name: "clientModified", type: "string", description: "Client-reported modified time (or null)." },
    { name: "serverModified", type: "string", description: "Dropbox server modified time (or null)." },
    { name: "contentHash", type: "string", description: "Dropbox content hash (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
