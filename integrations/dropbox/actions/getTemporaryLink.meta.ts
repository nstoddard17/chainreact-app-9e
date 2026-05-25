import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `get_temporary_link` ActionMeta — Slice 3.DROPBOX-4. FileRef
 * producer (signed_url arm).
 *
 * folderPath (UI-scope `dropbox:folders`) → path (`dropbox:files`) cascade.
 * Returns an auth-free ~4h download URL wrapped as a
 * FileRef(kind=signed_url) — treat it like sensitive access material. The
 * link is surfaced inside the FileRef (`file`), never as a plain string
 * URL output.
 */
export const dropboxGetTemporaryLinkMeta: ActionMeta = {
  key: "dropbox:get_temporary_link",
  provider: "dropbox",
  type: "get_temporary_link",
  displayName: "Get Temporary Link",
  description:
    "Get an auth-free temporary download link for a Dropbox file, wrapped as a FileRef any downstream consumer can fetch. The link expires after about 4 hours — treat it like sensitive access material.",
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
        "Pick a file from the selected folder, or type a full Dropbox file path. Root-level files must be typed manually.",
      type: "combobox",
      optionsSource: "dropbox:files",
      dependsOn: "folderPath",
      required: true,
      placeholder: "Select a folder first, or type a path",
    },
  ],
  outputs: [
    {
      name: "file",
      type: "fileRef",
      description: "FileRef(kind=signed_url) wrapping the ~4h temporary download link.",
      sensitive: true,
    },
    { name: "name", type: "string", description: "File name.", sensitive: true },
    { name: "path", type: "string", description: "Dropbox path of the file.", sensitive: true },
    { name: "sizeBytes", type: "number", description: "Size in bytes (or null)." },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Produces an auth-free temporary download link (valid ~4 hours) that grants access to the file without a Dropbox login. Treat it like sensitive access material.",
};
