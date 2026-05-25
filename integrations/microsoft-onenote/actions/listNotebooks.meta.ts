import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:list_notebooks` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `listNotebooks.schema.ts`:
 *   - `orderBy` OPTIONAL enum (6 values). Schema + meta default
 *               `displayName asc` matches the OneNote app's natural
 *               ordering.
 *
 * Risk: `low`. Pure read.
 *
 * Sensitive outputs:
 *   - `notebooks[]` — bulk collection; per-row `displayName` carries
 *                     organization / project identifiers. Marked
 *                     sensitive at the parent level.
 *   - `count` / `hasMore` / `nextLink` — structural / pagination;
 *                     not sensitive.
 */
export const microsoftOneNoteListNotebooksMeta: ActionMeta = {
  key: "microsoft-onenote:list_notebooks",
  provider: "microsoft-onenote",
  type: "list_notebooks",
  displayName: "List Notebooks",
  description:
    "List the connected user's OneNote notebooks via Graph `GET /me/onenote/notebooks`. Returns one page of results plus `nextLink` for forward-compat — does NOT auto-paginate. Most users have <20 notebooks.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "orderBy",
      label: "Sort order",
      description:
        "Sort the returned notebooks. Default `displayName asc` matches the OneNote app's natural ordering.",
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
      name: "notebooks",
      type: "array",
      description:
        "Per-notebook metadata array. Each entry: `{id, displayName, createdDateTime, lastModifiedDateTime, isDefault, isShared}`. Names often carry organization identifiers; treated as sensitive at the parent level.",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of notebooks returned this call.",
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
        "Graph `@odata.nextLink` URL when more notebooks exist. `null` when this is the final page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 110,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
