import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:remove_from_list`.
 *
 * Mirrors `removeFromList.schema.ts` — 2 required fields:
 * `listId` + `email`. Symmetric with `add_contact_to_list` — uses
 * the v3 list-membership-remove endpoint (NOT the legacy
 * `/contacts/v1/lists/{listId}/remove` URL).
 *
 * `listId` consumes the `hubspot:lists` resolver (same as
 * `add_contact_to_list`).
 *
 * REMOVES the contact FROM the list — does NOT delete the contact
 * from HubSpot. The CRM contact record is untouched; only the list
 * membership is removed.
 *
 * Outputs mirror `removeFromList.ts:return`:
 *   { listId, email, contactIdsRemoved, contactIdsDiscarded }
 */
export const hubspotRemoveFromListMeta: ActionMeta = {
  key: "hubspot:remove_from_list",
  provider: "hubspot",
  type: "remove_from_list",
  displayName: "Remove from List",
  description:
    "Remove a contact (by email) from a HubSpot MANUAL list via `/crm/v3/lists/{listId}/memberships/remove`. REMOVES THE MEMBERSHIP ONLY — the contact's CRM record is untouched. `contactIdsRemoved` is empty when HubSpot can't resolve the email to a list member — branch on `contactIdsRemoved.length === 0` to detect missing-membership situations. DYNAMIC lists are rejected by HubSpot with a 400 error.",
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
        "Contact's email address. Required. HubSpot resolves email → contactId server-side; if no list-member matches, the call returns an empty `contactIdsRemoved` (no error).",
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
      name: "contactIdsRemoved",
      type: "array",
      description:
        "HubSpot contact ids that were removed from the list. Empty when HubSpot couldn't resolve the email to an existing membership. Marked sensitive — membership IDs map to real CRM contacts.",
      sensitive: true,
    },
    {
      name: "contactIdsDiscarded",
      type: "array",
      description:
        "HubSpot contact ids that were rejected by the membership write (not-a-member, validation failures). Marked sensitive — membership IDs map to real CRM contacts.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 190,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Changes HubSpot list membership. Marketing automations + segmentation downstream of the list may fire as a result. Does NOT delete the contact from HubSpot — only removes the list membership.",
};
