import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder metadata for `microsoft-onedrive:list_items` — Slice 4.ONEDRIVE-META-3.
 * Mirrors `listItems.schema.ts`. Read action (low risk).
 *
 * `parentItemId` is a REAL optional field (the folder to list; root if
 * empty) → `microsoft-onedrive:folders`, no dep. The nested per-item
 * `downloadUrl` (`@microsoft.graph.downloadUrl`, a short-lived pre-signed
 * URL) is sensitive.
 */
export const microsoftOneDriveListItemsMeta: ActionMeta = {
  key: "microsoft-onedrive:list_items",
  provider: "microsoft-onedrive",
  type: "list_items",
  displayName: "List Items",
  description:
    "List the files and folders inside a OneDrive folder (or the drive root). Returns one page plus a nextLink.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "parentItemId",
      label: "Folder",
      description:
        "The folder to list. Leave empty to list the drive root. Pick a folder, or paste a folder item id.",
      type: "combobox",
      required: false,
      optionsSource: "microsoft-onedrive:folders",
      placeholder: "Drive root (or pick a folder)",
    },
    {
      name: "top",
      label: "Max results",
      description:
        "How many items to return at most (1–1000). Leave empty for the standard page of 200.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true },
    },
    {
      name: "orderBy",
      label: "Sort",
      description: "How the returned items are sorted.",
      type: "select",
      required: false,
      options: [
        { value: "name asc", label: "Name (A–Z)" },
        { value: "name desc", label: "Name (Z–A)" },
        { value: "lastModifiedDateTime desc", label: "Recently modified first" },
        { value: "lastModifiedDateTime asc", label: "Oldest modified first" },
        { value: "size desc", label: "Largest first" },
      ],
    },
  ],
  outputs: [
    {
      name: "items",
      type: "array",
      description: "The page of child items.",
      fields: [
        { name: "itemId", type: "string", description: "DriveItem id." },
        { name: "name", type: "string", description: "Item name." },
        { name: "kind", type: "string", description: '"file" or "folder".' },
        { name: "size", type: "number", description: "Bytes (files)." },
        { name: "mimeType", type: "string", description: "MIME type (files)." },
        { name: "webUrl", type: "string", description: "Item URL." },
        {
          name: "downloadUrl",
          type: "string",
          description: "Short-lived pre-signed download URL (files).",
          sensitive: true,
        },
        { name: "createdDateTime", type: "string", description: "ISO-8601 created." },
        {
          name: "lastModifiedDateTime",
          type: "string",
          description: "ISO-8601 modified.",
        },
      ],
    },
    { name: "count", type: "number", description: "Items in this page." },
    { name: "hasMore", type: "boolean", description: "More pages exist." },
    { name: "nextLink", type: "string", description: "Graph nextLink (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  isDestructive: false,
  requiresConfirmation: false,
  displayOrder: 10,
  riskLevel: "low",
  riskDescription: "Reads a folder listing — no provider-side mutation.",
};
