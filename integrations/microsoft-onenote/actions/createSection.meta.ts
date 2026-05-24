import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `microsoft-onenote:create_section` —
 * Slice 3.ONENOTE-4.
 *
 * Mirrors `createSection.schema.ts`:
 *   - `notebookId`  REQUIRED — parent notebook. Combobox via
 *                   `microsoft-onenote:notebooks` (no deps).
 *   - `displayName` REQUIRED — section title.
 *
 * Risk: `medium`. Creates a new external resource; recoverable by
 * deleting through OneNote (no V2 delete_section action yet — that
 * waits until a real consumer asks).
 *
 * Sensitive outputs:
 *   - `displayName` — sections carry project / customer identifiers.
 *   - `pagesUrl`    — Graph URL pointing at the section's pages
 *                     endpoint. Requires the bearer token; treated
 *                     sensitive as an addressable pointer.
 *   - `id` / `createdDateTime` / `lastModifiedDateTime` /
 *     `isDefault` — opaque / structural; not sensitive.
 */
export const microsoftOneNoteCreateSectionMeta: ActionMeta = {
  key: "microsoft-onenote:create_section",
  provider: "microsoft-onenote",
  type: "create_section",
  displayName: "Create Section",
  description:
    "Create a new OneNote section inside the chosen notebook via Graph `POST /me/onenote/notebooks/{id}/sections`. The new section appears at the end of the notebook's section list.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "notebookId",
      label: "Notebook",
      description:
        "Pick the parent notebook for the new section.",
      type: "combobox",
      optionsSource: "microsoft-onenote:notebooks",
      required: true,
      placeholder: "Search notebooks…",
    },
    {
      name: "displayName",
      label: "Section name",
      description:
        "Visible section title. Variables resolve at runtime — interpolate upstream node outputs with `{{nodeId.field}}` syntax.",
      type: "text",
      required: true,
      placeholder: "Q4 Planning",
    },
  ],
  outputs: [
    {
      name: "id",
      type: "string",
      description: "New section id (Graph onenoteSection id).",
    },
    {
      name: "displayName",
      type: "string",
      description: "Section title (echoed from input).",
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
      description:
        "Whether this is the notebook's default section (always `false` for newly-created sections).",
    },
    {
      name: "pagesUrl",
      type: "string",
      description:
        "Graph endpoint URL for the new section's pages collection. Requires the bearer token.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a new section in the chosen notebook. Recoverable via the OneNote app (no V2 delete_section action yet).",
};
