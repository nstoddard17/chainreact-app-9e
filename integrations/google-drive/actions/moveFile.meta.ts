import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:move_file` — Slice 4.GDRIVE-META-2.
 * Mirrors `moveFile.schema.ts`. Write action (medium risk — recoverable via
 * a follow-up move back).
 *
 * `newParentFolderId` wires to the existing `google-drive:folders` resolver
 * (required — Q11 wants the workflow author to make the destination explicit;
 * pass `"root"` to land at My Drive root). `fileId` ships as typeable text —
 * the `google-drive:files` resolver is DEFERRED (file lists are large /
 * ambiguous; the realistic source is a trigger or List Files output).
 *
 * No sensitive outputs — ids / name / parents / dates are structural.
 */
export const googleDriveMoveFileMeta: ActionMeta = {
  key: "google-drive:move_file",
  provider: "google-drive",
  type: "move_file",
  displayName: "Move File",
  description:
    "Move a file to a different folder. The handler reads the file's current parents and atomically detaches them before attaching the new parent.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "File",
      description:
        "The file to move. Pick a Drive file, or paste / wire a file id such as {{trigger.fileId}}.",
      type: "combobox",
      optionsSource: "google-drive:files",
      allowManualEntry: true,
      required: true,
      placeholder: "Search files or paste a file ID",
    },
    {
      name: "newParentFolderId",
      label: "Destination Folder",
      description:
        "Folder to move the file into. Pick a folder, or paste a folder id (use the literal \"root\" to move to My Drive root).",
      type: "combobox",
      required: true,
      optionsSource: "google-drive:folders",
      placeholder: "Pick a destination folder",
    },
  ],
  outputs: [
    { name: "fileId", type: "string", description: "The moved file's id." },
    { name: "name", type: "string", description: "The moved file's name (or null)." },
    {
      name: "parents",
      type: "array",
      description: "Parent folder ids after the move (one entry — the new destination).",
    },
    {
      name: "previousParents",
      type: "array",
      description: "Parent folder ids the file had BEFORE the move.",
    },
    { name: "modifiedTime", type: "string", description: "ISO-8601 last-modified timestamp (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 40,
  riskLevel: "medium",
  riskDescription: "Moves a file to a different folder (recoverable — move it back to undo).",
};
