import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `search_files` ActionMeta — Slice 3.DROPBOX-4. Pure read.
 *
 * `query` is required; `path` optionally scopes the search to a folder
 * (backed by `dropbox:folders`; empty / Root searches everywhere).
 */
export const dropboxSearchFilesMeta: ActionMeta = {
  key: "dropbox:search_files",
  provider: "dropbox",
  type: "search_files",
  displayName: "Search Files",
  description:
    "Search Dropbox for files and folders by name (and content where Dropbox supports it). Optionally scope the search to a folder.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "query",
      label: "Search query",
      description: "Text to search for in file/folder names.",
      type: "text",
      required: true,
      placeholder: "e.g. invoice",
    },
    {
      name: "path",
      label: "Folder scope",
      description:
        "Limit the search to a folder. Leave empty / pick Root to search everywhere.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Everywhere",
    },
    {
      name: "maxResults",
      label: "Max results",
      description: "Max matches to return (1–1000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 1000, integer: true },
    },
  ],
  outputs: [
    {
      name: "matches",
      type: "array",
      description: "Normalized file/folder matches.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of matches returned." },
    { name: "hasMore", type: "boolean", description: "True when more matches exist." },
    { name: "cursor", type: "string", description: "Cursor for the next page (or null)." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
