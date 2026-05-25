import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:create_notebook` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `createNotebook.schema.ts`:
 *   - `displayName` REQUIRED — only Graph-required field.
 *
 * V1 surfaced optional `color` / `role` fields; V2-v1 ships only
 * `displayName` per ONENOTE-2's no-scope-bloat principle. Follow-on
 * slices can add the optional fields when real consumers ask.
 *
 * Risk: `medium`. Creates a new top-level external resource.
 * Recoverable via the OneNote app (no V2 delete_notebook action yet).
 *
 * Sensitive outputs:
 *   - `displayName` — notebooks carry organization / project /
 *                     customer identifiers.
 *   - `sectionsUrl` / `sectionGroupsUrl` — Graph endpoint URLs for
 *                     the notebook's sections + section groups
 *                     collections. Require the bearer token.
 *   - `id` / `createdDateTime` / `lastModifiedDateTime` /
 *     `isDefault` / `isShared` — opaque / structural; not sensitive.
 */
export const microsoftOneNoteCreateNotebookMeta: ActionMeta = {
  key: "microsoft-onenote:create_notebook",
  provider: "microsoft-onenote",
  type: "create_notebook",
  displayName: "Create Notebook",
  description:
    "Create a new top-level OneNote notebook via Graph `POST /me/onenote/notebooks`. The new notebook is owned by the connected user and appears at the top of their personal notebook list.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "displayName",
      label: "Notebook name",
      description:
        "Visible notebook title. Variables resolve at runtime — interpolate upstream node outputs with `{{nodeId.field}}` syntax.",
      type: "text",
      required: true,
      placeholder: "Project Mercury",
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "New notebook id (Graph notebook id).",
    },
    {
      name: "displayName",
      type: "string",
      description: "Notebook title (echoed from input).",
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
      description:
        "Whether this is the user's default notebook (always `false` for newly-created notebooks).",
    },
    {
      name: "isShared",
      type: "boolean",
      description:
        "Whether the notebook is shared (always `false` for newly-created notebooks).",
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
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new top-level OneNote notebook. Recoverable via the OneNote app (no V2 delete_notebook action yet).",
};
