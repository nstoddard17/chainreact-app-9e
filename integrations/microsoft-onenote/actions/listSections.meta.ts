import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:list_sections` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `listSections.schema.ts`:
 *   - `notebookId` REQUIRED — notebook whose sections to list.
 *                  Combobox via `microsoft-onenote:notebooks`.
 *   - `orderBy`    OPTIONAL enum (6 values). Default `displayName asc`
 *                  (schema + meta agree).
 *
 * Risk: `low`. Pure read.
 *
 * Sensitive outputs:
 *   - `sections[]` — bulk collection; per-row `displayName` carries
 *                    project / customer identifiers. Marked sensitive
 *                    at the parent level (mirrors `list_pages.pages`).
 *   - `count` / `hasMore` / `nextLink` — structural / pagination;
 *                    not sensitive.
 */
export const microsoftOneNoteListSectionsMeta: ActionMeta = {
  key: "microsoft-onenote:list_sections",
  provider: "microsoft-onenote",
  type: "list_sections",
  displayName: "List Sections",
  description:
    "List the sections inside a OneNote notebook via Graph `GET /me/onenote/notebooks/{id}/sections`. Returns one page of results plus `nextLink` for forward-compat — does NOT auto-paginate.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description:
        "Pick a notebook to list sections from.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "orderBy",
      label: "Sort order",
      description:
        "Sort the returned sections. Default `displayName asc` matches the OneNote app's natural ordering.",
      type: "select",
      required: false,
      defaultValue: "displayName asc",
      options: [
        { value: "displayName asc", label: "Name A→Z" },
        { value: "displayName desc", label: "Name Z→A" },
        {
          value: "lastModifiedDateTime desc",
          label: "Most recently modified first",
        },
        {
          value: "lastModifiedDateTime asc",
          label: "Least recently modified first",
        },
        { value: "createdDateTime desc", label: "Newest first (created)" },
        { value: "createdDateTime asc", label: "Oldest first (created)" },
      ],
    },
  ],
  outputs: [
    {
      name: "sections",
      type: "array",
      description:
        "Per-section metadata array. Each entry: `{id, displayName, createdDateTime, lastModifiedDateTime, isDefault}`. Section names often carry project / customer identifiers; treated as sensitive at the parent level.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of sections returned this call.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description:
        "Convenience scalar — `true` when Graph returned a `nextLink`.",
    },
    {
      name: "nextLink",
      type: "string",
      description:
        "Graph `@odata.nextLink` URL when more sections exist. `null` when this is the final page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 80,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
