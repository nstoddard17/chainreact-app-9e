import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:delete_file` — Slice 4.GDRIVE-META-2.
 * Mirrors `deleteFile.schema.ts`.
 *
 * **Risk: high + destructive + requiresConfirmation (Marcus decision — in
 * BOTH modes).** `permanent:true` is irreversible. `permanent:false` trashes
 * the file (recoverable from Drive's trash UI), but Drive auto-purges
 * trashed files after ~30 days, so even the soft path is genuinely
 * destructive. Single-tier safety-first risk mirrors OneDrive `delete_item` /
 * Airtable `delete_record` / GCal `delete_event`. The handler's
 * `alreadyDeleted` short-circuit makes the action idempotent on retry — it
 * does NOT make it non-destructive.
 *
 * `fileId` ships as typeable text (no `google-drive:files` resolver
 * referenced); commonly trigger/upstream-fed. No output is PII-bearing, so
 * none is marked sensitive.
 */
export const googleDriveDeleteFileMeta: ActionMeta = {
  key: "google-drive:delete_file",
  provider: "google-drive",
  type: "delete_file",
  displayName: "Delete File",
  description:
    "Delete a Google Drive file. Permanent mode is irreversible. Trash mode is recoverable from the Drive UI but auto-purges after ~30 days.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "File",
      description:
        "The file to delete. Pick a Drive file, or paste / wire a file id such as {{trigger.fileId}}.",
      type: "combobox",
      optionsSource: "google-drive:files",
      allowManualEntry: true,
      required: true,
      placeholder: "Search files or paste a file ID",
    },
    {
      name: "permanent",
      label: "Permanent",
      description:
        "When on, the file is permanently destroyed and cannot be recovered. When off, the file is moved to Drive's trash (restorable via the Drive UI; Drive auto-purges trashed files after about 30 days).",
      type: "boolean",
      required: true,
    },
  ],
  outputs: [
    { name: "fileId", type: "string", description: "The deleted file's id." },
    {
      name: "mode",
      type: "string",
      description: '"permanent" or "trash" — which delete mode ran.',
    },
    {
      name: "alreadyDeleted",
      type: "boolean",
      description: "True if the file was already gone (idempotent delete).",
    },
    {
      name: "trashed",
      type: "boolean",
      description: "Trash mode only — true once the file was moved to trash.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: true,
  requiresConfirmation: true,
  displayOrder: 50,
  riskLevel: "high",
  riskDescription:
    "Deletes a file. With Permanent on, the file cannot be recovered. With Permanent off, the file is trashed (restorable from the Google Drive UI, but auto-purged after about 30 days).",
};
