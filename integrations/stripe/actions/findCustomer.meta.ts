import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:find_customer`.
 *
 * Mirrors `findCustomer.schema.ts`:
 *   - `customerId` (optional) — direct lookup via `GET /v1/customers/{id}`.
 *   - `email`      (optional) — list filter via `GET /v1/customers?email=…&limit=1`.
 *
 * Cross-field invariant (runtime-enforced, NOT expressible in FieldMeta):
 * EXACTLY ONE of `customerId` / `email` must be supplied. Description
 * documents this; schema's `.refine` rejects bad payloads at runtime.
 *
 * 404 / empty list → `{found: false, customer: null}` (NOT thrown).
 *
 * Outputs match `findCustomer.ts:return` exactly — bounded customer
 * projection (no raw spread).
 */
export const stripeFindCustomerMeta: ActionMeta = {
  key: "stripe:find_customer",
  provider: "stripe",
  type: "find_customer",
  displayName: "Find Customer",
  description:
    "Look up a Stripe customer. Provide EXACTLY ONE of Customer ID (direct lookup) or Email (list filter). Stripe's email index isn't unique — when multiple customers share an email, the first match is returned; workflows that need deterministic results should pass Customer ID. Returns `found: false` on no match (does NOT throw).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customerId",
      label: "Customer ID",
      description:
        "Stripe customer id (`cus_xxx`) for direct lookup. Leave empty when looking up by Email instead.",
      type: "text",
      required: false,
      placeholder: "cus_xxx",
    },
    {
      name: "email",
      label: "Email",
      description:
        "Customer email for list-filter lookup. Returns the first match when multiple customers share the email. Leave empty when looking up by Customer ID instead.",
      type: "text",
      required: false,
      placeholder: "customer@example.com",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when Stripe returned a customer; false when the lookup found nothing (404 OR empty list).",
    },
    {
      name: "customer",
      type: "object",
      description:
        "Bounded customer projection when `found: true` (`{customerId, email, name, description, created, livemode, metadata}`); null when `found: false`. Mirrors Create Customer's output shape for drop-in downstream wiring.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
};
