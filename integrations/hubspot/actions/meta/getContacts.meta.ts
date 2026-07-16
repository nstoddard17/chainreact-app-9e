import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_contacts`.
 *
 * Mirrors `getContacts.schema.ts`:
 *   - `limit` (optional, ≤100 — HubSpot's documented cap; wrapper
 *     clamps).
 *   - `after` (optional opaque pagination cursor).
 *   - `properties` (optional string | string[]) — property names to
 *     return. Surfaced as `string-array` chips so authors can add
 *     property names one at a time. Runtime accepts either form.
 *   - `filterProperty` + `filterValue` — optional single-property EQ
 *     filter. BOTH must be present to apply.
 *
 * Default property set (when `properties` omitted): `firstname`,
 * `lastname`, `email`, `phone`, `company` (matches V1's default).
 *
 * Outputs match `getContacts.ts:return` — pagination shape +
 * `contacts[]`. The contacts array is marked sensitive — each entry
 * carries the HubSpot property map with full PII (email, phone,
 * names, addresses).
 */
export const hubspotGetContactsMeta: ActionMeta = {
  key: "hubspot:get_contacts",
  provider: "hubspot",
  type: "get_contacts",
  displayName: "Get Contacts",
  description:
    "List HubSpot CRM contacts via `/crm/v3/objects/contacts/search`. Read-only. Cursor pagination via `after` (use the prior response's `nextCursor`). Optional single-property EQ filter via `filterProperty` + `filterValue` (BOTH must be present). When `properties` is omitted, HubSpot returns the default set: `firstname`, `lastname`, `email`, `phone`, `company`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max contacts per call (1..100, HubSpot's documented cap). Use `after` for pagination.",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
    {
      name: "after",
      label: "After (cursor)",
      description:
        "Opaque pagination cursor. Pass the previous call's `nextCursor` to fetch the next page. Omit for the first page.",
      type: "text",
      required: false,
      advanced: true,
    },
    {
      name: "properties",
      label: "Properties",
      description:
        "HubSpot property names to return for each contact. Add property names as individual chips (e.g. `firstname`, `lastname`, `email`, `phone`, `company`, `lifecyclestage`, custom property names). Omit to use HubSpot's default set.",
      type: "string-array",
      optionsSource: "hubspot:contact_properties",
      allowManualEntry: true,
      required: false,
      advanced: true,
    },
    {
      name: "filterProperty",
      label: "Filter property",
      description:
        "Optional HubSpot property to filter on (EQ match) — pick from the portal's real properties or type a custom internal name. Pair with `Filter value` — BOTH fields must be present for the filter to apply.",
      type: "combobox",
      optionsSource: "hubspot:contact_properties",
      allowManualEntry: true,
      required: false,
      placeholder: "email",
    },
    {
      name: "filterValue",
      label: "Filter value",
      description:
        "Only return contacts whose chosen property exactly equals this value.",
      type: "text",
      required: false,
      visibleWhen: { field: "filterProperty", valueTruthy: true },
      placeholder: "alice@example.com",
    },
  ],
  outputs: [
    {
      name: "contacts",
      type: "array",
      description:
        "Array of HubSpot contacts. Each entry carries `{id, properties, createdAt, updatedAt}` with the property map containing the fields requested via `Properties` (or HubSpot's default set). Marked sensitive — each entry carries PII (email / phone / names / addresses / custom property values).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of contacts returned in this page (== `contacts.length`).",
    },
    {
      name: "total",
      type: "number",
      description: "HubSpot's total-matches count for the search (across all pages).",
    },
    {
      name: "nextCursor",
      type: "string",
      description: "Opaque cursor for the next page. Null when there are no more pages.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description: "True when another page is available — call this action again with `After (cursor)` set to `nextCursor`.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
