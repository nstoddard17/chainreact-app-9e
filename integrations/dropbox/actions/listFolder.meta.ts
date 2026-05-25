import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Dropbox `list_folder` ActionMeta — Slice 3.DROPBOX-4. Pure read.
 *
 * `path` is the folder to list (root = empty / Root), backed by
 * `dropbox:folders`. Surfaces Dropbox's `cursor` + `hasMore` so workflows
 * can paginate via a follow-up call with the same cursor (folder /
 * recursive / limit are ignored by Dropbox when continuing).
 */
export const dropboxListFolderMeta: ActionMeta = {
  key: "dropbox:list_folder",
  provider: "dropbox",
  type: "list_folder",
  displayName: "List Folder",
  description:
    "List the entries in a Dropbox folder. Leave the folder empty (or pick Root) for the top level. Returns one page plus a cursor for the next.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "path",
      label: "Folder",
      description: "Folder to list. Leave empty / pick Root for the top level.",
      type: "combobox",
      optionsSource: "dropbox:folders",
      required: false,
      placeholder: "Root",
    },
    {
      name: "recursive",
      label: "Recursive",
      description: "List nested folders recursively.",
      type: "boolean",
      required: false,
    },
    {
      name: "limit",
      label: "Limit",
      description: "Max entries to return (1–2000).",
      type: "number",
      required: false,
      numeric: { min: 1, max: 2000, integer: true },
    },
    {
      name: "cursor",
      label: "Next-page cursor",
      description:
        "Continue a previous list. When set, the folder / recursive / limit fields are ignored by Dropbox.",
      type: "text",
      required: false,
      placeholder: "Opaque token from a previous call",
    },
  ],
  outputs: [
    {
      name: "entries",
      type: "array",
      description: "Normalized file/folder descriptors on this page.",
      sensitive: true,
    },
    { name: "count", type: "number", description: "Number of entries returned." },
    { name: "cursor", type: "string", description: "Cursor for the next page (or null)." },
    { name: "hasMore", type: "boolean", description: "True when more pages exist." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
