import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:list_files` — Slice 4.GDRIVE-META-2.
 * Mirrors `listFiles.schema.ts`. Read action (low risk).
 *
 * `folderId` wires to the existing `google-drive:folders` resolver; optional —
 * when unset, lists across My Drive without a parent filter (pass `"root"`
 * explicitly to target the root). No `google-drive:files` resolver is
 * referenced anywhere (DEFERRED — files lists are large/ambiguous;
 * downstream nodes wire off `files[0].id` or pass `pageToken` back in).
 *
 * `files` output is the bulk array — marked sensitive because Drive's
 * default `files.list` response includes owners (with email addresses) and
 * other per-file metadata that may carry PII (mirrors the Notion `results` /
 * Gmail `messages` / GCal `events` bulk-read precedent).
 */
export const googleDriveListFilesMeta: ActionMeta = {
  key: "google-drive:list_files",
  provider: "google-drive",
  type: "list_files",
  displayName: "List Files",
  description:
    "List files in a Google Drive folder (or across My Drive when no folder is selected). Returns one page plus a nextPageToken.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "folderId",
      label: "Folder",
      description:
        "Folder to list. Leave empty to list across My Drive. Pick a folder, or paste a folder id.",
      type: "combobox",
      required: false,
      optionsSource: "google-drive:folders",
      placeholder: "My Drive (or pick a folder)",
    },
    {
      name: "pageSize",
      label: "Page Size",
      description: "Max files to return per page (1–1000).",
      type: "number",
      required: false,
      defaultValue: 100,
      numeric: { min: 1, max: 1000, integer: true },
    },
    {
      name: "pageToken",
      label: "Page Token",
      description: "Pagination cursor from a prior run's Next Page Token.",
      type: "text",
      required: false,
    },
    {
      name: "includeTrashed",
      label: "Include Trashed",
      description: "When on, also return files currently in Drive's trash.",
      type: "boolean",
      required: false,
      defaultValue: false,
    },
  ],
  outputs: [
    {
      name: "files",
      type: "array",
      description:
        "The page of files (each carries id, name, mimeType, parents, and may include owner emails).",
      sensitive: true,
    },
    { name: "nextPageToken", type: "string", description: "Cursor for the next page (or null)." },
    {
      name: "incompleteSearch",
      type: "boolean",
      description: "True if Drive could not complete the search across all corpora.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 30,
  riskLevel: "low",
  riskDescription: "Reads Drive files — no provider-side mutation.",
};
