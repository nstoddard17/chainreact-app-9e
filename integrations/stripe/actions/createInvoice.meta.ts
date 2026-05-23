import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:create_invoice`.
 *
 * **MONEY-MOVING (when `autoAdvance` is true).** Creates a draft
 * invoice. When `autoAdvance` is true (Stripe's server-side default
 * when omitted), Stripe automatically transitions the invoice from
 * `draft` → `open` and attempts collection — money moves once
 * collection succeeds. Workflows that want to keep the invoice in
 * `draft` (e.g. to attach line items first) pass `autoAdvance: false`.
 *
 * Mirrors `createInvoice.schema.ts`:
 *   - `customerId`  (required) — existing Stripe customer.
 *   - `description` (optional) — visible on the hosted invoice page.
 *   - `metadata`    (optional) — Record<string,string>.
 *   - `autoAdvance` (optional boolean) — no default applied here.
 *                    Stripe defaults `true` server-side when omitted,
 *                    which queues automatic finalization + collection.
 *                    Pass `false` to keep the invoice in `draft` until
 *                    a downstream action finalizes it.
 *
 * Outputs match `createInvoice.ts:return` — 14-key bounded projection.
 * `hostedInvoiceUrl` and `invoicePdf` are intentional customer-facing
 * Stripe URLs (safe to expose).
 */
export const stripeCreateInvoiceMeta: ActionMeta = {
  key: "stripe:create_invoice",
  provider: "stripe",
  type: "create_invoice",
  displayName: "Create Invoice",
  description:
    "Create a draft Stripe invoice for an existing customer. **MONEY-MOVING when `autoAdvance` is true** — Stripe's server-side default is `true` when the field is omitted, which queues automatic finalization and collection. Pass `autoAdvance: false` to keep the invoice in `draft` state until a downstream action finalizes it. Line-item attachment and finalization happen via separate API surfaces (not exposed in V2 yet).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customerId",
      label: "Customer ID",
      description:
        "Stripe customer (`cus_xxx`) to invoice. Usually wired from `{{stripe:create_customer.customerId}}` or `{{stripe:find_customer.customer.customerId}}`.",
      type: "text",
      required: true,
      placeholder: "cus_xxx",
    },
    {
      name: "description",
      label: "Description",
      description:
        "Optional free-text description, visible to the customer on the hosted invoice page.",
      type: "textarea",
      required: false,
      placeholder: "Q4 enterprise plan renewal",
    },
    {
      name: "metadata",
      label: "Metadata",
      description:
        "Optional key/value pairs persisted on the invoice. Stripe caps at 50 keys per object.",
      type: "keyvalue",
      required: false,
      keyValueMaxRows: 50,
    },
    {
      name: "autoAdvance",
      label: "Auto-advance",
      description:
        "Optional — controls whether Stripe automatically finalizes the draft invoice and attempts collection. **No default applied here.** When omitted, Stripe applies its server-side default of `true` — the invoice transitions draft → open and Stripe attempts collection (this is MONEY-MOVING). Pass `false` to keep the invoice in `draft` until a downstream action explicitly finalizes it.",
      type: "boolean",
      required: false,
    },
  ],
  outputs: [
    {
      name: "invoiceId",
      type: "string",
      description:
        "Stripe invoice id (`in_xxx`). Wire to downstream invoice lookups or for log correlation.",
    },
    {
      name: "customerId",
      type: "string",
      description: "Stripe customer id (echoed).",
    },
    {
      name: "subscriptionId",
      type: "string",
      description:
        "Stripe subscription id when the invoice is attached to a subscription (non-subscription invoices return null).",
    },
    {
      name: "status",
      type: "string",
      description:
        "Invoice status — typically `draft`, `open`, `paid`, `uncollectible`, or `void`.",
    },
    {
      name: "collectionMethod",
      type: "string",
      description:
        "How Stripe collects payment — `charge_automatically` or `send_invoice`. Defaults to `charge_automatically` when the customer has a payment method on file.",
    },
    {
      name: "autoAdvance",
      type: "boolean",
      description:
        "Echo of Stripe's resolved auto-advance flag (Stripe's server-side default applies when input is omitted).",
    },
    {
      name: "hostedInvoiceUrl",
      type: "string",
      description:
        "**Customer-facing Stripe-hosted invoice URL.** Populated once the invoice transitions to `open` or beyond — null on fresh drafts. Safe to expose; this is the documented Stripe invoice viewing surface.",
      sensitive: true,
    },
    {
      name: "invoicePdf",
      type: "string",
      description:
        "**Customer-facing Stripe-hosted invoice PDF URL.** Populated once the invoice transitions to `open` or beyond — null on fresh drafts. Safe to expose.",
      sensitive: true,
    },
    {
      name: "amountDue",
      type: "number",
      description:
        "Amount owed in CENTS (Stripe wire-format). Zero on a fresh draft with no line items.",
    },
    {
      name: "amountPaid",
      type: "number",
      description:
        "Amount collected so far in CENTS (Stripe wire-format). Zero on a fresh draft.",
    },
    {
      name: "currency",
      type: "string",
      description:
        "Lowercase ISO-4217 currency code. Null on drafts until Stripe resolves it from the customer or line items.",
    },
    {
      name: "description",
      type: "string",
      description: "Description (echoed). Null when not supplied.",
    },
    {
      name: "metadata",
      type: "object",
      description: "Metadata persisted on the invoice (echoed).",
    },
    {
      name: "livemode",
      type: "boolean",
      description: "True for live Stripe account; false for test mode.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 150,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "high",
  riskDescription: "Creates an invoice. Default `auto_advance: true` (Stripe-side default) finalizes and queues collection automatically.",
};
