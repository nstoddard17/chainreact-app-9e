import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `upload_file` ActionMeta — Slice 3.DROPBOX-4. FileRef consumer.
 *
 * `file` is a FileRef input; provider_url FileRefs are rejected at runtime
 * (stage bytes first). `path` is the destination FOLDER (root = empty),
 * backed by `dropbox:folders`; the filename comes from the FileRef (or the
 * Filename override). `mode` defaults to "add" — never silently overwrites
 * (no hidden high-risk default). Single-shot upload is bounded to ~150 MB;
 * resumable >150 MB upload is deferred.
 */
export const dropboxUploadFileMeta: ActionMeta = {
  key: "dropbox:upload_file",
  provider: "dropbox",
  type: "upload_file",
  displayName: "Upload File",
  description:
    "Upload a file into Dropbox. Source is a FileRef from an upstream download/staging action. FileRef(kind=provider_url) is not supported — stage bytes first (e.g. dropbox:download_file, gmail:get_attachment). Simple upload is limited to ~150 MB; larger resumable uploads are not yet supported.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "file",
      label: "File",
      description:
        "Upstream FileRef to upload. Insert a {{nodeId.file}} token from a producer (download/staging) action.",
      type: "file",
      required: true,
      placeholder: "Paste a {{...}} FileRef token",
    },
    {
      name: "path",
      label: "Destination folder",
      description:
        "Folder to upload into. Leave empty (or pick Root) for the top level. The uploaded file name comes from the file itself unless overridden below.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Root",
    },
    {
      name: "filename",
      label: "Filename (override)",
      type: "text",
      required: false,
      placeholder: "Defaults to the file's own name",
    },
    {
      name: "mode",
      label: "Conflict mode",
      description: "Defaults to Add (never overwrites an existing file).",
      type: "select",
      required: false,
      options: [
        { value: "add", label: "Add (never overwrite)" },
        { value: "overwrite", label: "Overwrite" },
      ],
    },
    {
      name: "autorename",
      label: "Auto-rename on conflict",
      description: "Rename automatically instead of failing when a file already exists.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "Dropbox file id." },
    { name: "name", type: "string", description: "Stored file name.", sensitive: true },
    { name: "path", type: "string", description: "Dropbox path of the uploaded file.", sensitive: true },
    { name: "sizeBytes", type: "number", description: "Uploaded size in bytes." },
    { name: "rev", type: "string", description: "Dropbox revision id." },
    { name: "clientModified", type: "string", description: "Client-reported modified time (or null).", nullable: true },
    { name: "serverModified", type: "string", description: "Dropbox server modified time (or null).", nullable: true },
  ],
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Writes a file into Dropbox. Recoverable by deleting the uploaded file. With Overwrite mode it can replace an existing file at the same path.",
};
