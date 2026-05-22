import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:restore_page`.
 *
 * Mirrors `restorePage.schema.ts`: single required `pageId`. The
 * handler hard-codes `archived: false`. Inverse of Archive Page.
 *
 * Outputs match `restorePage.ts:return` — `{pageId, url, archived,
 * lastEditedTime}`.
 */
export const notionRestorePageMeta: ActionMeta = {
  key: "notion:restore_page",
  provider: "notion",
  type: "restore_page",
  displayName: "Restore Page",
  description:
    "Restore a previously-archived Notion page (or database row). Inverse of Archive Page. The `archived: false` write is hard-coded — no toggle field.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page ID",
      description:
        "Notion page id to restore. Accepts both bare-page ids and database-row ids.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
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
      description: "Archived state after the call (always false on success).",
    },
    {
      name: "lastEditedTime",
      type: "string",
      description: "ISO 8601 timestamp of the restore write.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
};
