import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:get_section_details` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `getSectionDetails.schema.ts`:
 *   - `notebookId` OPTIONAL UI scope-narrower (handler ignores) —
 *                  parent of the sections picker.
 *   - `sectionId`  REQUIRED — combobox via `microsoft-onenote:sections`
 *                  (depends on `notebookId`).
 *
 * Risk: `low`. Pure read.
 *
 * Sensitive outputs:
 *   - `displayName` — sections carry project / customer identifiers.
 *   - `pagesUrl`    — Graph URL pointing at the section's pages
 *                     endpoint. Requires the bearer token.
 *   - `links`       — embedded `oneNoteClientUrl` + `oneNoteWebUrl`
 *                     hrefs (canonical OneNote URLs).
 *   - `id` / `createdDateTime` / `lastModifiedDateTime` /
 *     `isDefault` — opaque / structural; not sensitive.
 */
export const microsoftOneNoteGetSectionDetailsMeta: ActionMeta = {
  key: "microsoft-onenote:get_section_details",
  provider: "microsoft-onenote",
  type: "get_section_details",
  displayName: "Get Section Details",
  description:
    "Fetch the full metadata block for a single OneNote section via Graph `GET /me/onenote/sections/{id}`. Returns the same shape Graph emits, including `links` (canonical OneNote URLs) and `pagesUrl` (Graph endpoint for the section's pages collection).",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description:
        "Pick a notebook from the connected account. Required so the section picker scopes its results.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "sectionId",
      label: "Section",
      description:
        "Pick a section to fetch details for.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "Section id (echoed from input.sectionId).",
    },
    {
      name: "displayName",
      type: "string",
      description: "Section title.",
      sensitive: true,
    },
    {
      name: "createdDateTime",
      type: "string",
      description: "ISO 8601 timestamp the section was created.",
    },
    {
      name: "lastModifiedDateTime",
      type: "string",
      description: "ISO 8601 timestamp of the most recent modification.",
    },
    {
      name: "isDefault",
      type: "boolean",
      description: "Whether this is the notebook's default section.",
    },
    {
      name: "pagesUrl",
      type: "string",
      description:
        "Graph endpoint URL for the section's pages collection. Requires the bearer token.",
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
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
