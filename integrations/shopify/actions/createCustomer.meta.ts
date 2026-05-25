import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:create_customer` — Slice 4.SHOPIFY-META-2.
 * Mirrors `createCustomer.schema.ts`. `send_welcome_email` is an explicit
 * consent gate (Q11) — maps to Shopify's wire `send_email_welcome`. Customer
 * PII outputs (email, first/last name) are marked sensitive.
 */
export const shopifyCreateCustomerMeta: ActionMeta = {
  key: "shopify:create_customer",
  provider: "shopify",
  type: "create_customer",
  displayName: "Create Customer",
  description:
    "Create a customer on the connected Shopify store. `send_welcome_email` is an explicit consent gate — when true, Shopify emails the customer a welcome/account-invite message.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "email",
      label: "Email",
      description: "Customer email.",
      type: "text",
      required: true,
      placeholder: "customer@example.com",
    },
    {
      name: "send_welcome_email",
      label: "Send Welcome Email",
      description:
        "Required, no default (explicit consent). When true, Shopify emails the customer a welcome message.",
      type: "boolean",
      required: true,
    },
    {
      name: "first_name",
      label: "First Name",
      description: "Optional customer first name.",
      type: "text",
      required: false,
    },
    {
      name: "last_name",
      label: "Last Name",
      description: "Optional customer last name.",
      type: "text",
      required: false,
    },
    {
      name: "phone",
      label: "Phone",
      description: "Optional customer phone number.",
      type: "text",
      required: false,
    },
    {
      name: "tags",
      label: "Tags",
      description: "Optional comma-separated tags applied to the customer.",
      type: "text",
      required: false,
    },
  ],
  outputs: [
    { name: "customerId", type: "string", description: "Shopify customer id." },
    {
      name: "email",
      type: "string",
      description: "Customer email Shopify stored (echo).",
      sensitive: true,
    },
    {
      name: "firstName",
      type: "string",
      description: "First name Shopify stored. Null when not supplied.",
      sensitive: true,
    },
    {
      name: "lastName",
      type: "string",
      description: "Last name Shopify stored. Null when not supplied.",
      sensitive: true,
    },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the customer." },
    { name: "createdAt", type: "string", description: "ISO timestamp the customer was created." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 90,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a customer record (PII) and may email the customer. Recoverable external write.",
};
