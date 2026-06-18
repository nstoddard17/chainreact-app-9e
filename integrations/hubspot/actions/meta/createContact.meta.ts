import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `hubspot:create_contact`.
 *
 * Mirrors `createContact.schema.ts` EXACTLY (14 standard CRM property
 * fields + `email` + `duplicateHandling`). The schema does NOT
 * include `hubspot_owner_id` — owner assignment on contacts is
 * deferred per the V1 contract parity (V1's create-contact didn't
 * accept it either). The HUBSPOT-2 `hubspot:owners` resolver lands
 * on the deal/ticket/engagement metas in HUBSPOT-4/5.
 *
 * `duplicateHandling` (V2 fix for V1's regex-extract bug):
 *   - `fail` (default) — surface the 409 as an error.
 *   - `update` — deterministic search-by-email + PATCH the existing
 *     contact with the supplied properties.
 *   - `skip` — deterministic search-by-email + return the existing
 *     contact unchanged.
 *
 * Output mirrors `createContact.ts:return` exactly. `email`,
 * `firstName`, `lastName`, and the `properties` map are marked
 * sensitive — direct PII surfaces. `wasUpdate` / `wasSkip` /
 * `contactId` / timestamps stay non-sensitive.
 */
export const hubspotCreateContactMeta: ActionMeta = {
  key: "hubspot:create_contact",
  provider: "hubspot",
  type: "create_contact",
  displayName: "Create Contact",
  description:
    "Create a new HubSpot CRM contact via `/crm/v3/objects/contacts`. Requires `email`. On HubSpot's 409 (duplicate), the deterministic search-by-email path can `update` the existing contact or `skip` and return it unchanged — pick via `Duplicate handling`. Output's `wasUpdate` / `wasSkip` booleans tell downstream nodes which path ran.",
  category: "crm",
  requiresIntegration: true,
  fields: [
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email",
      description:
        "Contact's email address. Required. Used as the dedup key when `Duplicate handling` is `update` or `skip`.",
      type: "text",
      required: true,
      placeholder: "alice@example.com",
    },
    {
      name: "firstname",
      label: "First name",
      description: "HubSpot `firstname` property.",
      type: "text",
      required: false,
      placeholder: "Alice",
    },
    {
      name: "lastname",
      label: "Last name",
      description: "HubSpot `lastname` property.",
      type: "text",
      required: false,
      placeholder: "Adams",
    },
    {
      name: "phone",
      sensitivity: "recipient",
      label: "Phone",
      description: "HubSpot `phone` property — free-form string, no format validation.",
      type: "text",
      required: false,
      placeholder: "+1-555-0100",
    },
    {
      name: "company",
      label: "Company name",
      description:
        "Free-form company name string on the contact's `company` property. NOT a HubSpot company id — to associate the contact with a HubSpot company record use a downstream association action.",
      type: "text",
      required: false,
      placeholder: "Acme Inc.",
    },
    {
      name: "jobtitle",
      label: "Job title",
      description: "HubSpot `jobtitle` property.",
      type: "text",
      required: false,
      placeholder: "Engineering Lead",
    },
    {
      name: "website",
      label: "Website",
      description: "HubSpot `website` property — free-form URL string.",
      type: "text",
      required: false,
      placeholder: "https://example.com",
    },
    {
      name: "lifecyclestage",
      label: "Lifecycle stage",
      description:
        "HubSpot `lifecyclestage` property. Typical values (portal-configurable): `subscriber`, `lead`, `marketingqualifiedlead`, `salesqualifiedlead`, `opportunity`, `customer`, `evangelist`, `other`. Pass the HubSpot internal stage name.",
      type: "text",
      required: false,
      placeholder: "lead",
    },
    {
      name: "hs_lead_status",
      label: "Lead status",
      description:
        "HubSpot `hs_lead_status` property. Portal-configured enum (typical values: `NEW`, `OPEN`, `IN_PROGRESS`, `OPEN_DEAL`, `UNQUALIFIED`, `ATTEMPTED_TO_CONTACT`, `CONNECTED`, `BAD_TIMING`).",
      type: "text",
      required: false,
      placeholder: "NEW",
    },
    {
      name: "address",
      sensitivity: "recipient",
      label: "Address",
      description: "HubSpot `address` property — single line.",
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
    {
      name: "duplicateHandling",
      label: "Duplicate handling",
      description:
        "What to do when HubSpot returns 409 (a contact with this email already exists). `fail` surfaces the error; `update` PATCHes the existing contact with the supplied properties; `skip` returns the existing contact unchanged. Output `wasUpdate` / `wasSkip` reflect which path ran.",
      type: "select",
      required: true,
      defaultValue: "fail",
      options: [
        {
          value: "fail",
          label: "fail",
          description: "Surface the 409 error. Default.",
        },
        {
          value: "update",
          label: "update",
          description: "Search-by-email + PATCH existing contact.",
        },
        {
          value: "skip",
          label: "skip",
          description: "Search-by-email + return existing contact unchanged.",
        },
      ],
    },
  ],
  outputs: [
    {
      name: "contactId",
      type: "string",
      description: "HubSpot contact id. Wire downstream into `update_contact` / engagement associations.",
    },
    {
      name: "email",
      type: "string",
      description: "Echoed email — equals `properties.email` when HubSpot returns it. Marked sensitive — direct PII.",
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
      name: "createdAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "updatedAt",
      type: "string",
      description: "ISO 8601 timestamp from HubSpot.",
    },
    {
      name: "wasUpdate",
      type: "boolean",
      description: "True when `Duplicate handling: update` recovered from a 409 by PATCHing the existing contact.",
    },
    {
      name: "wasSkip",
      type: "boolean",
      description: "True when `Duplicate handling: skip` returned the existing contact unchanged.",
    },
    {
      name: "properties",
      type: "object",
      description:
        "Full HubSpot contact properties map — the variable-shape object HubSpot returns. Can carry every property the workflow set + every property HubSpot defaults. Marked sensitive — PII-bearing.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates or updates a HubSpot CRM contact visible to all portal users. Existing properties are overwritten when `Duplicate handling: update` is chosen.",
};
