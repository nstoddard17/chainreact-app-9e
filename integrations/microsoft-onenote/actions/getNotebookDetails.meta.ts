import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:get_notebook_details` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `getNotebookDetails.schema.ts`:
 *   - `notebookId` REQUIRED — combobox via `microsoft-onenote:notebooks`
 *                  (no deps).
 *
 * Risk: `low`. Pure read.
 *
 * Sensitive outputs:
 *   - `displayName` — notebooks carry organization / project /
 *                     customer identifiers.
 *   - `sectionsUrl` / `sectionGroupsUrl` / `links` — Graph + OneNote
 *                     URLs.
 *   - `id` / `createdDateTime` / `lastModifiedDateTime` /
 *     `isDefault` / `isShared` — opaque / structural; not sensitive.
 */
export const microsoftOneNoteGetNotebookDetailsMeta: ActionMeta = {
  key: "microsoft-onenote:get_notebook_details",
  provider: "microsoft-onenote",
  type: "get_notebook_details",
  displayName: "Get Notebook Details",
  description:
    "Fetch the full metadata block for a single OneNote notebook via Graph `GET /me/onenote/notebooks/{id}`. Returns the same shape Graph emits, including `links` (canonical OneNote URLs), `sectionsUrl`, and `sectionGroupsUrl`.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description: "Pick a notebook to fetch details for.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "Notebook id (echoed from input.notebookId).",
    },
    {
      name: "displayName",
      type: "string",
      description: "Notebook title.",
      sensitive: true,
    },
    {
      name: "createdDateTime",
      type: "string",
      description: "ISO 8601 timestamp the notebook was created.",
    },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO 8601 timestamp of the most recent modification.",
    },
    {
      name: "isDefault",
      type: "boolean",
      description: "Whether this is the user's default notebook.",
    },
    {
      name: "isShared",
      type: "boolean",
      description: "Whether the notebook is shared with other users.",
    },
    {
      name: "sectionsUrl",
      type: "string",
      description:
        "Graph endpoint URL for the notebook's sections collection.",
      sensitive: true,
    },
    {
      name: "sectionGroupsUrl",
      type: "string",
      description:
        "Graph endpoint URL for the notebook's section-groups collection.",
      sensitive: true,
    },
    {
      name: "links",
      type: "object",
      description:
        "Embedded `oneNoteClientUrl` (opens in the desktop app) and `oneNoteWebUrl` (opens in the OneNote web app) hrefs.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
