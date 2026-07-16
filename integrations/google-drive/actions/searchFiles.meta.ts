import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `google-drive:search_files` — Slice 4.GDRIVE-READ-2.
 * Mirrors `searchFiles.schema.ts`. Read action (low risk).
 *
 * `folderId` reuses the already-shipped `google-drive:folders` resolver
 * (optional — leave empty to search across My Drive). `query` is a free-text
 * name match. `pageSize` is capped at 100 (focused lookup, not a bulk dump).
 *
 * `files` is a bulk read and is marked sensitive — mirrors the list_files
 * precedent (file metadata can carry PII-ish names); the run-detail API
 * redacts it. `webViewLink` inside each entry is an auth-gated deeplink, not
 * a signed URL.
 */
export const googleDriveSearchFilesMeta: ActionMeta = {
  key: "google-drive:search_files",
  provider: "google-drive",
  type: "search_files",
  displayName: "Search Files",
  description:
    "Search Google Drive files by name (title match — not file content). Returns one page of file metadata plus a Next Page Token. Read-only.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "query",
      label: "Search Query",
      description:
        "Text to match against file names (Drive `name contains`). Matches the title only, not the file's contents.",
      type: "text",
      required: true,
      placeholder: "quarterly report",
    },
    {
      name: "folderId",
      label: "Folder",
      description:
        "Optional folder to scope the search to. Leave empty to search across My Drive. Pick a folder, or paste a folder id.",
      type: "combobox",
      required: false,
      optionsSource: "google-drive:folders",
      placeholder: "My Drive (or pick a folder)",
    },
    {
      name: "pageSize",
      label: "Page Size",
      description: "Max files to return per page (1–100).",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
    },
    {
      name: "pageToken",
      label: "Page Token",
      description: "Pagination cursor from a prior run's Next Page Token.",
      type: "text",
      required: false,
      advanced: true,
    },
  ],
  outputs: [
    {
      name: "files",
      type: "array",
      description:
        "The page of matching files (each carries id, name, mimeType, modifiedTime, size, webViewLink).",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of files on this page." },
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
  displayOrder: 70,
  riskLevel: "low",
  riskDescription: "Searches Drive file metadata by name — no provider-side mutation, no content download.",
};
