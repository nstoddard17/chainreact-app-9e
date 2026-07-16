import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_tickets`.
 *
 * Mirrors `getTickets.schema.ts` — same shape as `get_contacts` /
 * `get_companies` / `get_deals` (limit / after / properties /
 * filterProperty + filterValue). Default property set when
 * `properties` is omitted (handler-side): `subject`, `content`,
 * `hs_pipeline`, `hs_pipeline_stage`, `hs_ticket_priority`.
 *
 * Outputs match `getTickets.ts:return` — pagination shape +
 * `tickets[]`. The tickets array is marked sensitive — each entry
 * carries the HubSpot property map with customer-identifying support
 * data (subject, content, custom support-context columns).
 */
export const hubspotGetTicketsMeta: ActionMeta = {
  key: "hubspot:get_tickets",
  provider: "hubspot",
  type: "get_tickets",
  displayName: "Get Tickets",
  description:
    "List HubSpot CRM tickets via `/crm/v3/objects/tickets/search`. Read-only. Cursor pagination via `after` (use the prior response's `nextCursor`). Optional single-property EQ filter via `filterProperty` + `filterValue` (BOTH must be present). When `properties` is omitted, returns the default set: `subject`, `content`, `hs_pipeline`, `hs_pipeline_stage`, `hs_ticket_priority`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max tickets per call (1..100, HubSpot's documented cap). Use `after` for pagination.",
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
        "HubSpot property names to return for each ticket. Add property names as individual chips (e.g. `subject`, `content`, `hs_pipeline`, `hs_pipeline_stage`, `hs_ticket_priority`, `hs_ticket_category`, custom property names). Omit to use HubSpot's default set.",
      type: "string-array",
      optionsSource: "hubspot:ticket_properties",
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
      optionsSource: "hubspot:ticket_properties",
      allowManualEntry: true,
      required: false,
      placeholder: "hs_pipeline_stage",
    },
    {
      name: "filterValue",
      label: "Filter value",
      description:
        "Only return tickets whose chosen property exactly equals this value. Stage filters use the internal stage id — copy it from the Stage picker on Create Ticket.",
      type: "text",
      required: false,
      visibleWhen: { field: "filterProperty", valueTruthy: true },
      placeholder: "1",
    },
  ],
  outputs: [
    {
      name: "tickets",
      type: "array",
      description:
        "Array of HubSpot tickets. Each entry carries `{id, properties, createdAt, updatedAt}` with the property map containing the fields requested via `Properties` (or HubSpot's default set). Marked sensitive — each entry carries customer-identifying support data (subject / content / custom support-context columns).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of tickets returned in this page (== `tickets.length`).",
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
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
