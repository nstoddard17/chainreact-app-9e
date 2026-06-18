import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:update_contact`.
 *
 * Mirrors `updateContact.schema.ts`: `contactId` (required) + the same
 * 14 standard CRM property fields as `create_contact`, all optional.
 * Handler enforces "at least one property field must be present" at
 * runtime — the meta keeps every property optional so authors can
 * partial-update.
 *
 * `contactId` is plain text in V1 — the HubSpot contact-search
 * resolver is intentionally deferred per HUBSPOT-1 §4.2 (search-by-
 * email picker is a follow-up polish slice). Authors wire from
 * `{{hubspot:create_contact.contactId}}` / `{{hubspot:get_contacts.contacts[0].id}}`.
 *
 * Output mirrors `updateContact.ts:return` exactly — narrower than
 * `create_contact` (no `wasUpdate` / `wasSkip` because update has
 * one path).
 */
export const hubspotUpdateContactMeta: ActionMeta = {
  key: "hubspot:update_contact",
  provider: "hubspot",
  type: "update_contact",
  displayName: "Update Contact",
  description:
    "Update a HubSpot CRM contact via `/crm/v3/objects/contacts/{id}`. Requires the contact id and at least one property field to update — runtime rejects empty updates. Pass only the fields you want to change; omitted fields are left untouched.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "contactId",
      label: "Contact ID",
      description:
        "HubSpot contact id (numeric, returned by the API as a string). Usually wired from `{{hubspot:create_contact.contactId}}` or `{{hubspot:get_contacts.contacts[0].id}}`. Search-by-email picker is a follow-up slice.",
      type: "text",
      required: true,
      placeholder: "12345",
    },
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email",
      description: "Update HubSpot's `email` property. Note: changing email can affect dedup keys for downstream automations.",
      type: "text",
      required: false,
      placeholder: "alice@example.com",
    },
    {
      name: "firstname",
      label: "First name",
      description: "HubSpot `firstname` property.",
      type: "text",
      required: false,
    },
    {
      name: "lastname",
      label: "Last name",
      description: "HubSpot `lastname` property.",
      type: "text",
      required: false,
    },
    {
      name: "phone",
      sensitivity: "recipient",
      label: "Phone",
      description: "HubSpot `phone` property.",
      type: "text",
      required: false,
    },
    {
      name: "company",
      label: "Company name",
      description: "Free-form company name on the contact's `company` property (not a HubSpot company id).",
      type: "text",
      required: false,
    },
    {
      name: "jobtitle",
      label: "Job title",
      description: "HubSpot `jobtitle` property.",
      type: "text",
      required: false,
    },
    {
      name: "website",
      label: "Website",
      description: "HubSpot `website` property.",
      type: "text",
      required: false,
    },
    {
      name: "lifecyclestage",
      label: "Lifecycle stage",
      description:
        "HubSpot `lifecyclestage` property. Portal-configured enum (`subscriber` / `lead` / `marketingqualifiedlead` / `salesqualifiedlead` / `opportunity` / `customer` / `evangelist` / `other` plus customs).",
      type: "text",
      required: false,
    },
    {
      name: "hs_lead_status",
      label: "Lead status",
      description: "HubSpot `hs_lead_status` property. Portal-configured enum.",
      type: "text",
      required: false,
    },
    {
      name: "address",
      sensitivity: "recipient",
      label: "Address",
      description: "HubSpot `address` property.",
      type: "text",
      required: false,
    },
    {
      name: "city",
      label: "City",
      description: "HubSpot `city` property.",
      type: "text",
      required: false,
    },
    {
      name: "state",
      label: "State / region",
      description: "HubSpot `state` property.",
      type: "text",
      required: false,
    },
    {
      name: "zip",
      label: "ZIP / postal code",
      description: "HubSpot `zip` property.",
      type: "text",
      required: false,
    },
    {
      name: "country",
      label: "Country",
      description: "HubSpot `country` property.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    {
      name: "contactId",
      type: "string",
      description: "HubSpot contact id (echoed).",
    },
    {
      name: "email",
      type: "string",
      description: "Echoed `email` property (null when HubSpot didn't return it). Marked sensitive — direct PII.",
      sensitive: true,
    },
    {
      name: "firstName",
      type: "string",
      description: "Echoed `firstname` property (null when omitted). Marked sensitive — direct PII.",
      sensitive: true,
    },
    {
      name: "lastName",
      type: "string",
      description: "Echoed `lastname` property (null when omitted). Marked sensitive — direct PII.",
      sensitive: true,
    },
    {
      name: "updatedAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot contact properties map after the update. Variable-shape, can carry any HubSpot property. Marked sensitive — PII-bearing.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Updates a HubSpot CRM contact's properties. Supplied fields overwrite existing values; reversible only by writing the prior values back.",
};
