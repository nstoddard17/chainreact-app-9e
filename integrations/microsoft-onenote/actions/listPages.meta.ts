import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:list_pages` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `listPages.schema.ts`:
 *   - `notebookId` OPTIONAL UI scope-narrower (handler ignores) —
 *                  parent of the sections picker.
 *   - `sectionId`  REQUIRED — section whose pages to list. Combobox
 *                  via `microsoft-onenote:sections` (depends on
 *                  `notebookId`).
 *   - `top`        OPTIONAL number — `$top` page size. Schema bounds
 *                  1..100 (Graph caps at 100 for OneNote pages).
 *                  Schema + meta default: 20.
 *   - `orderBy`    OPTIONAL enum — 6 values from `lastModifiedDateTime`
 *                  / `createdDateTime` / `title` × asc/desc. Schema +
 *                  meta default: `lastModifiedDateTime desc`.
 *
 * **V1's raw OData `filter` field is intentionally NOT exposed** per
 * ONENOTE-1 §4.1 D-defer — OData strings are footgun-prone without a
 * validation layer, and the V2-v1 surface has no schema-level
 * validation for them. A future structured filter set (date-range /
 * title-contains) ships when real consumers ask.
 *
 * Risk: `low`. Pure read; no mutation.
 *
 * Sensitive outputs:
 *   - `pages[]` — bulk collection of per-page metadata. Per-row
 *                 `title` / `contentUrl` / `webUrl` are sensitive
 *                 (project / customer identifiers + bearer-token
 *                 URLs). Marked sensitive at the parent level
 *                 because the entire array is the read product.
 *   - `count` / `hasMore` / `nextLink` — structural counters /
 *                 pagination signals; not sensitive.
 */
export const microsoftOneNoteListPagesMeta: ActionMeta = {
  key: "microsoft-onenote:list_pages",
  provider: "microsoft-onenote",
  type: "list_pages",
  displayName: "List Pages",
  description:
    "List the pages inside a OneNote section via Graph `GET /me/onenote/sections/{id}/pages`. Returns one page of results plus `nextLink` for forward-compat — does NOT auto-paginate (chain follow-up nodes for page 2+). Graph caps `top` at 100 for OneNote pages.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description:
        "Pick a notebook from the connected account. Required so the section picker can scope its results.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "sectionId",
      label: "Section",
      description:
        "Pick a section to list pages from. Change the notebook and the section picker re-fetches.",
      type: "combobox",
      optionsSource: "microsoft-onenote:sections",
      dependsOn: "notebookId",
      required: true,
      placeholder: "Select Notebook first",
    },
    {
      name: "top",
      label: "Max results",
      description: "How many pages to return (1–100). Default 20.",
      type: "number",
      required: false,
      defaultValue: 20,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
      placeholder: "20",
    },
    {
      name: "orderBy",
      label: "Sort order",
      description:
        "Sort the returned pages. Default `lastModifiedDateTime desc` surfaces the most-recently-edited pages first.",
      type: "select",
      required: false,
      defaultValue: "lastModifiedDateTime desc",
      options: [
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
        { value: "title asc", label: "Title A→Z" },
        { value: "title desc", label: "Title Z→A" },
      ],
    },
  ],
  outputs: [
    {
      name: "pages",
      type: "array",
      description:
        "Per-page metadata array. Each entry: `{id, title, contentUrl, webUrl, createdDateTime, lastModifiedDateTime, level, order}`. Contains page titles + Graph URLs; treated as sensitive at the parent level.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description:
        "Number of pages returned this call (== pages.length). Does NOT reflect total pages in the section — use `hasMore` / `nextLink` for pagination.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description:
        "Convenience scalar — `true` when Graph returned a `nextLink`. Use it to branch on pagination needs.",
    },
    {
      name: "nextLink",
      type: "string",
      description:
        "Graph `@odata.nextLink` URL when more pages exist. `null` when this is the final page. Forward-compat for future paginate-all chaining.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
