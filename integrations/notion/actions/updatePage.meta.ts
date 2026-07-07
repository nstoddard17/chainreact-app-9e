import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `notion:update_page`.
 *
 * Mirrors `updatePage.schema.ts`:
 *   - `pageId`     (required) — page to mutate.
 *   - `properties` (optional) — same typed property-input map as create_page.
 *                  Only the keys you set are PATCHed; omitted keys keep
 *                  their current value.
 *   - `archived`   (optional) — true archives, false un-archives, omitted
 *                  leaves the archived state alone.
 *   - `icon`       (optional) — same shape as create_page's icon; null clears.
 *   - `cover`      (optional) — same shape as create_page's cover; null clears.
 *
 * Cross-field invariant (runtime-enforced, NOT expressible in FieldMeta):
 * the request MUST set at least one of `properties` / `archived` / `icon`
 * / `cover` — `updatePage.schema.ts`'s refine rejects empty mutations.
 *
 * Outputs match `updatePage.ts:return` — `{pageId, url, archived,
 * lastEditedTime}`.
 */
export const notionUpdatePageMeta: ActionMeta = {
  key: "notion:update_page",
  provider: "notion",
  type: "update_page",
  displayName: "Update Page",
  description:
    "PATCH a Notion page — mutate properties / archived state / icon / cover. Only the fields you set are sent; omitted fields keep their current value. The runtime schema requires at least one mutating field (properties / archived / icon / cover) — pageId alone is rejected.",
  category: "data",
  requiresIntegration: true,
  fields: [
    {
      name: "pageId",
      label: "Page ID",
      description:
        "Notion page to update. Usually wired from `{{notion:create_page.pageId}}` / `{{notion:query_database.results[0].id}}` / `{{notion:search.results[0].id}}`.",
      type: "text",
      required: true,
      placeholder: "abcd1234-...",
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "Optional typed property-input map. PATCH semantics — only keys you set are updated; omitted keys keep their value. Same shape as Create Page.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: '{"Status":{"type":"select","value":"Done"}}',
    },
    {
      name: "archived",
      label: "Archived",
      description:
        "Optional. True archives the page; false un-archives. Omitted leaves the archived state alone. Prefer the dedicated Archive Page / Restore Page actions when archive state is the only mutation.",
      type: "boolean",
      required: false,
    },
    {
      name: "icon",
      label: "Icon",
      description:
        "Optional. Same shape as Create Page. Pass `null` to clear the existing icon.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: '{"type":"emoji","emoji":"🎯"}',
    },
    {
      name: "cover",
      label: "Cover",
      description:
        "Optional. Same shape as Create Page. Pass `null` to clear the existing cover.",
      type: "textarea",
      required: false,
      advanced: true,
      placeholder: '{"type":"external","external":{"url":"https://..."}}',
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
      description: "Current archived state after the update.",
    },
    {
      name: "lastEditedTime",
      type: "string",
      description: "ISO 8601 timestamp of the update.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
