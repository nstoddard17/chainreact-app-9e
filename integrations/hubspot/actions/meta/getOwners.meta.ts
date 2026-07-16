import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:get_owners`.
 *
 * Mirrors `getOwners.schema.ts`:
 *   - `limit`  (optional, 1..100 — HubSpot's documented cap).
 *   - `email`  (optional, server-side exact filter — schema validates
 *               the email shape).
 *   - `after`  (optional opaque pagination cursor).
 *
 * Outputs match `getOwners.ts:return` — `{ owners, count, nextCursor,
 * hasMore }`. Each entry in `owners` is
 * `{id, email, firstName, lastName, userId, createdAt, updatedAt}`.
 * The `owners` array is marked sensitive — every entry carries
 * employee PII (work email + names). Workflows use the entry's `id`
 * (NOT the `userId`) as the value for downstream `hubspot_owner_id`
 * property writes on contacts / companies / deals / tickets.
 *
 * NOTE: this is the read-only `get_owners` companion to the
 * `hubspot:owners` resolver used by create / update metas above. The
 * action shape is useful for workflows that need to enumerate owners
 * at runtime (e.g. round-robin owner assignment) — distinct from the
 * design-time picker.
 */
export const hubspotGetOwnersMeta: ActionMeta = {
  key: "hubspot:get_owners",
  provider: "hubspot",
  type: "get_owners",
  displayName: "Get Owners",
  description:
    "List HubSpot CRM owners (user accounts in the portal) via `GET /crm/v3/owners`. Read-only. Optional server-side `email` exact filter. Cursor pagination via `after` (use the prior response's `nextCursor`). Each entry's `id` is the value for downstream `hubspot_owner_id` property writes on contacts / companies / deals / tickets — NOT the `userId`.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "limit",
      label: "Limit",
      description:
        "Max owners per call (1..100, HubSpot's documented cap).",
      type: "number",
      required: false,
      defaultValue: 100,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
    },
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email filter",
      description:
        "Optional server-side EXACT email match (HubSpot's `email` query param). Use to look up a specific owner by their work email.",
      type: "text",
      required: false,
      placeholder: "owner@example.com",
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
  ],
  outputs: [
    {
      name: "owners",
      type: "array",
      description:
        "Array of HubSpot owners. Each entry: `{id, email, firstName, lastName, userId, createdAt, updatedAt}`. Use `id` (NOT `userId`) as the value for downstream `hubspot_owner_id` property writes. Marked sensitive — every entry carries employee PII (work email + names).",
      sensitive: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of owners returned in this page (== `owners.length`).",
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
  displayOrder: 130,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
