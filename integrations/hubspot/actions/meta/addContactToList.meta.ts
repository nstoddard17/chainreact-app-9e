import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:add_contact_to_list`.
 *
 * Mirrors `addContactToList.schema.ts` — 2 required fields:
 * `listId` + `email`. HubSpot resolves email → contactId server-side
 * via the v3 list-membership-add endpoint (V2 collapsed V1's
 * search-then-add two-step into a single call).
 *
 * `listId` consumes the HUBSPOT-2 `hubspot:lists` resolver. The
 * resolver surfaces `processingType` (MANUAL / DYNAMIC) on each
 * option's description so workflow authors don't accidentally target
 * a DYNAMIC list (HubSpot rejects membership writes against dynamic
 * lists with a 400 VALIDATION_ERROR).
 *
 * Outputs mirror `addContactToList.ts:return`:
 *   { listId, email, contactIdsAdded, contactIdsDiscarded }
 *
 * `email` is in the structural test's SUSPICIOUS_NAMES set — MUST
 * be marked sensitive (also matches: it's customer-identifying PII
 * even though it's an input echo). `contactIdsAdded` /
 * `contactIdsDiscarded` are membership IDs — sensitive per the
 * HUBSPOT-5 plan.
 */
export const hubspotAddContactToListMeta: ActionMeta = {
  key: "hubspot:add_contact_to_list",
  provider: "hubspot",
  type: "add_contact_to_list",
  displayName: "Add Contact to List",
  description:
    "Add a contact (by email) to a HubSpot MANUAL list via `/crm/v3/lists/{listId}/memberships/add`. HubSpot resolves the email → contactId server-side. `contactIdsAdded` is empty when HubSpot can't resolve the email — branch on `contactIdsAdded.length === 0` to detect missing-contact situations. DYNAMIC lists are rejected by HubSpot with a 400 error; the list picker surfaces each list's `MANUAL` / `DYNAMIC` processingType on its description.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "listId",
      label: "List",
      description:
        "Pick a HubSpot list. The picker shows each list's `processingType` (MANUAL / DYNAMIC) on the option description — pick a MANUAL list; DYNAMIC lists are rejected by HubSpot's membership-write API with a 400 VALIDATION_ERROR.",
      type: "combobox",
      optionsSource: "hubspot:lists",
      required: true,
      placeholder: "Search HubSpot lists…",
    },
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email",
      description:
        "Contact's email address. Required. HubSpot resolves email → contactId server-side; if no contact matches, the call returns an empty `contactIdsAdded` (no error).",
      type: "text",
      required: true,
      placeholder: "alice@example.com",
    },
  ],
  outputs: [
    {
      name: "listId",
      type: "string",
      description: "Echoed listId (the list the membership write targeted).",
    },
    {
      name: "email",
      type: "string",
      description: "Echoed email. Marked sensitive — direct PII.",
      sensitive: true,
    },
    {
      name: "contactIdsAdded",
      type: "array",
      description:
        "HubSpot contact ids that were added to the list. Empty when HubSpot couldn't resolve the email to a contact. Marked sensitive — membership IDs map to real CRM contacts.",
      sensitive: true,
    },
    {
      name: "contactIdsDiscarded",
      type: "array",
      description:
        "HubSpot contact ids that were rejected by the membership write (already-members, validation failures). Marked sensitive — membership IDs map to real CRM contacts.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 180,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes HubSpot list membership. Marketing automations + segmentation downstream of the list may fire as a result.",
};
