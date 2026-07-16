import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:update_customer` — Slice 4.SHOPIFY-META-2.
 * Mirrors `updateCustomer.schema.ts`. All fields except `customer_id`
 * optional (partial PUT). `accepts_marketing` is a consent field; omit to
 * leave unchanged. No Q11 email gate. Email output is sensitive (PII).
 */
export const shopifyUpdateCustomerMeta: ActionMeta = {
  key: "shopify:update_customer",
  provider: "shopify",
  type: "update_customer",
  displayName: "Update Customer",
  description:
    "Update fields on an existing customer. Only supplied fields change. `accepts_marketing` records the customer's marketing consent; omit it to leave unchanged.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customer_id",
      label: "Customer ID",
      description: "The Shopify customer id to update.",
      type: "text",
      required: true,
      placeholder: "207119551",
    },
    {
      name: "email",
      sensitivity: "recipient",
      label: "Email",
      description: "Optional new email.",
      type: "text",
      required: false,
    },
    {
      name: "first_name",
      label: "First Name",
      description: "Optional new first name.",
      type: "text",
      required: false,
    },
    {
      name: "last_name",
      label: "Last Name",
      description: "Optional new last name.",
      type: "text",
      required: false,
    },
    {
      name: "phone",
      sensitivity: "recipient",
      label: "Phone",
      description: "Optional new phone number.",
      type: "text",
      required: false,
    },
    {
      name: "tags",
      label: "Tags",
      description:
        "Optional comma-separated tags. **Replaces ALL existing tags on the customer — include any you want to keep.**",
      type: "text",
      required: false,
    },
    {
      name: "note",
      label: "Note",
      description: "Optional internal note on the customer.",
      type: "textarea",
      required: false,
    },
    {
      name: "accepts_marketing",
      label: "Accepts Marketing",
      description:
        "Optional marketing-consent flag. Only set this to true with the customer's actual consent. Omit to leave the current value unchanged.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the update succeeded." },
    { name: "customerId", type: "string", description: "The Shopify customer id." },
    {
      name: "email",
      type: "string",
      description: "Customer email after update (echo).",
      sensitive: true,
    },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the customer." },
    { name: "updatedAt", type: "string", description: "ISO timestamp of the update." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 100,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Updates a customer record (PII) — recoverable external write.",
};
