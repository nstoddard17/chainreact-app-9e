import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:archive_page`.
 *
 * Mirrors `archivePage.schema.ts`: a single required `pageId`. The
 * handler hard-codes `archived: true` — workflow authors cannot
 * override it via config. Use Restore Page for the inverse.
 *
 * Database rows ARE pages in Notion's data model — this action works
 * on both bare pages and database row ids.
 *
 * Outputs match `archivePage.ts:return` — `{pageId, url, archived,
 * lastEditedTime}`.
 */
export const notionArchivePageMeta: ActionMeta = {
  key: "notion:archive_page",
  provider: "notion",
  type: "archive_page",
  displayName: "Archive Page",
  description:
    "Archive a Notion page (or database row — both are pages in Notion's model). Archived pages move to trash and stop appearing in default searches. Use Restore Page to un-archive. The `archived: true` write is hard-coded — no toggle field.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page",
      description:
        "Page to archive. Pick one, paste an id, or wire `{{...}}` from an upstream step. Accepts both bare-page ids and database-row ids (rows are pages in Notion).",
      type: "combobox",
      optionsSource: "notion:pages",
      allowManualEntry: true,
      required: true,
      placeholder: "Select a page, or paste an id",
    },
  ],
  outputs: [
    {
      name: "pageId",
      type: "string",
      description: "Notion page id (echoed from the response).",
    },
    {
      name: "url",
      type: "string",
      description: "Public Notion URL. Null when Notion's response omits it.",
    },
    {
      name: "archived",
      type: "boolean",
      description: "Archived state after the call (always true on success).",
    },
    {
      name: "lastEditedTime",
      type: "string",
      description: "ISO 8601 timestamp of the archive write.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: true,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Archives a page — hidden from workspace; recoverable via `restore_page` but invisible until then.",
};
