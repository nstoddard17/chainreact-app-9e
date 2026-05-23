import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:update_customer`.
 *
 * Mirrors `updateCustomer.schema.ts`:
 *   - `customerId`  (required) — existing customer to update.
 *   - `email`       (optional) — replace email if supplied.
 *   - `name`        (optional) — replace name if supplied.
 *   - `description` (optional) — replace description if supplied.
 *   - `metadata`    (optional) — REPLACE all metadata if supplied
 *                   (Stripe PATCH semantics).
 *
 * Outputs match `updateCustomer.ts:return` exactly — mirrors create_customer.
 */
export const stripeUpdateCustomerMeta: ActionMeta = {
  key: "stripe:update_customer",
  provider: "stripe",
  type: "update_customer",
  displayName: "Update Customer",
  description:
    "Update an existing Stripe customer on the connected merchant account. Only supplied fields are sent; omitted fields keep their current value. NOT a charge — no money moves.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customerId",
      label: "Customer ID",
      description:
        "Stripe customer id (`cus_xxx`) to update. Usually wired from `{{stripe:create_customer.customerId}}` or `{{stripe:find_customer.customer.customerId}}`.",
      type: "text",
      required: true,
      placeholder: "cus_xxx",
    },
    {
      name: "email",
      label: "Email",
      description:
        "Optional. When supplied, replaces the customer's email.",
      type: "text",
      required: false,
      placeholder: "customer@example.com",
    },
    {
      name: "name",
      label: "Name",
      description: "Optional. When supplied, replaces the customer's name.",
      type: "text",
      required: false,
      placeholder: "Jane Doe",
    },
    {
      name: "description",
      label: "Description",
      description:
        "Optional. When supplied, replaces the customer's description.",
      type: "textarea",
      required: false,
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs. When supplied, **REPLACES** the customer's existing metadata (Stripe's PATCH semantic for `metadata` — not a merge). Omit to keep existing metadata intact. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
  ],
  outputs: [
    {
      name: "customerId",
      type: "string",
      description: "Stripe customer id (echoed from the response).",
    },
    {
      name: "email",
      type: "string",
      description: "Email after the update.",
    },
    {
      name: "name",
      type: "string",
      description: "Name after the update.",
    },
    {
      name: "description",
      type: "string",
      description: "Description after the update.",
    },
    {
      name: "created",
      type: "number",
      description: "Unix epoch seconds when Stripe originally created the customer.",
    },
    {
      name: "livemode",
      type: "boolean",
      description: "True for Stripe live account; false for test mode.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata after the update.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
};
