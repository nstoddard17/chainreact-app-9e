import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_customer`.
 *
 * Mirrors `createCustomer.schema.ts`:
 *   - `email`       (required) — RFC email. Stripe accepts customers
 *                   without email, but workflow-driven creation almost
 *                   always has one; schema makes it required.
 *   - `name`        (optional) — display name.
 *   - `description` (optional) — internal note (Stripe stores).
 *   - `metadata`    (optional) — `Record<string,string>`. `keyvalue`
 *                   field with `keyValueMaxRows: 50` (Stripe's
 *                   per-object cap).
 *
 * Required Stripe Connect scope: `read_write` (already granted by the
 * Stripe manifest).
 *
 * Outputs match `createCustomer.ts:return` exactly — no raw spread.
 */
export const stripeCreateCustomerMeta: ActionMeta = {
  key: "stripe:create_customer",
  provider: "stripe",
  type: "create_customer",
  displayName: "Create Customer",
  description:
    "Create a Stripe customer on the connected merchant account. Stores email, name, description, and metadata. NOT a charge — no money moves; the customer is only the billing identity wired into downstream Create Payment Intent / Create Subscription / Create Invoice actions.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "email",
      label: "Email",
      description:
        "Customer email (RFC format). Stripe stores it and uses it for receipt delivery.",
      type: "text",
      required: true,
      placeholder: "customer@example.com",
    },
    {
      name: "name",
      label: "Name",
      description: "Optional customer display name.",
      type: "text",
      required: false,
      placeholder: "Jane Doe",
    },
    {
      name: "description",
      label: "Description",
      description:
        "Optional internal note (visible in Stripe Dashboard; not shown on receipts).",
      type: "textarea",
      required: false,
      placeholder: "Enterprise plan signup — Q4 cohort",
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the Stripe customer object. Stripe coerces non-string values to strings server-side; the meta layer stays strict (Record<string,string>) to surface conversion at design time. Stripe caps metadata at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
  ],
  outputs: [
    {
      name: "customerId",
      type: "string",
      description:
        "Stripe customer id (`cus_xxx`). Wire to downstream Create Payment Intent / Create Subscription / Update Customer.",
    },
    {
      name: "email",
      type: "string",
      description: "Email Stripe stored (echoed from the response).",
    },
    {
      name: "name",
      type: "string",
      description: "Name Stripe stored. Null when not supplied.",
    },
    {
      name: "description",
      type: "string",
      description: "Description Stripe stored. Null when not supplied.",
    },
    {
      name: "created",
      type: "number",
      description: "Unix epoch seconds when Stripe created the customer.",
    },
    {
      name: "livemode",
      type: "boolean",
      description:
        "True when the customer was created against Stripe's live account; false for test mode.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata Stripe stored (echoed `Record<string,string>`).",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Creates a Stripe Customer record — external write, easy to update or delete but persists in Stripe's audit trail.",
};
