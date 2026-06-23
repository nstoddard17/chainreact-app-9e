import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:get_file_metadata` — Slice 4.GDRIVE-READ-2.
 * Mirrors `getFileMetadata.schema.ts`. Read action (low risk).
 *
 * `fileId` ships as typeable text — the `google-drive:files` options
 * resolver is deferred (file lists are large/ambiguous; the realistic
 * source is a trigger or a List Files / Search Files output).
 *
 * Outputs are a bounded metadata projection (no owners/permissions, no file
 * content). `webViewLink` is NOT marked sensitive — it is an auth-gated
 * Drive deeplink, not a signed URL (mirrors list_files / OneDrive `webUrl`).
 */
export const googleDriveGetFileMetadataMeta: ActionMeta = {
  key: "google-drive:get_file_metadata",
  provider: "google-drive",
  type: "get_file_metadata",
  displayName: "Get File Metadata",
  description:
    "Read metadata for a single Google Drive file (name, type, size, timestamps, view link). Read-only — does not download file content.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "File",
      description:
        "The file to read. Pick a Drive file, or paste / wire a file id such as {{trigger.fileId}}.",
      type: "combobox",
      optionsSource: "google-drive:files",
      allowManualEntry: true,
      required: true,
      placeholder: "Search files or paste a file ID",
    },
  ],
  outputs: [
    { name: "id", type: "string", description: "The file's id (echoed)." },
    { name: "name", type: "string", description: "The file's name (or null).", nullable: true },
    { name: "mimeType", type: "string", description: "The file's MIME type (or null).", nullable: true },
    {
      name: "size",
      type: "string",
      description:
        "Size in bytes as a string for binary files; null for native Google Docs/Sheets/Slides types.",
      nullable: true,
    },
    { name: "createdTime", type: "string", description: "ISO-8601 creation timestamp (or null).", nullable: true },
    { name: "modifiedTime", type: "string", description: "ISO-8601 last-modified timestamp (or null).", nullable: true },
    {
      name: "webViewLink",
      type: "string",
      description: "Auth-gated Drive deeplink to open the file in a browser (or null).",
      nullable: true,
    },
    { name: "trashed", type: "boolean", description: "True when the file is currently in Drive's trash." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 60,
  riskLevel: "low",
  riskDescription: "Reads a single file's metadata — no provider-side mutation, no content download.",
};
