import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:create_order` — Slice 4.SHOPIFY-META-2.
 *
 * Mirrors `createOrder.schema.ts` field-for-field (snake_case names match
 * the runtime Zod schema property names — the builder writes config keyed
 * by these names and the handler's `.strict()` schema rejects drift).
 *
 * `line_items` is an `object-list` (variant id + quantity rows) that writes
 * the REAL array the runtime schema expects (CONFIG-UX-AUDIT-1 — the old
 * paste-JSON textarea stored a string the `.strict()` schema rejected).
 * The two address objects stay JSON textareas behind the Advanced
 * disclosure (fixed-key single objects; a structured address editor is a
 * follow-up). Outputs mirror `createOrder.ts:return` exactly; `email` is
 * marked sensitive (customer PII).
 */
export const shopifyCreateOrderMeta: ActionMeta = {
  key: "shopify:create_order",
  provider: "shopify",
  type: "create_order",
  displayName: "Create Order",
  description:
    "Create an order on the connected Shopify store. Requires a customer email and at least one line item (by product variant id). `send_receipt` is an explicit consent gate — when true, Shopify emails the customer an order receipt.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "email",
      sensitivity: "recipient",
      label: "Customer Email",
      description: "Email of the customer the order is created for.",
      type: "text",
      required: true,
      placeholder: "customer@example.com",
    },
    {
      name: "line_items",
      label: "Line items",
      description:
        "What the order contains. Add at least one line — Shopify rejects empty orders. The variant id is the numeric id of the product variant being ordered.",
      type: "object-list",
      required: true,
      itemFields: [
        {
          name: "variant_id",
          label: "Product variant ID",
          type: "number",
          required: true,
          placeholder: "123456789",
        },
        {
          name: "quantity",
          label: "Quantity",
          type: "number",
          required: true,
          placeholder: "1",
        },
      ],
    },
    {
      name: "send_receipt",
      label: "Send Receipt Email",
      description:
        "Required, no default (explicit consent). When true, Shopify emails the customer an order receipt. Choose deliberately.",
      type: "boolean",
      required: true,
    },
    {
      name: "financial_status",
      label: "Financial Status",
      description: "Optional initial financial status for the order.",
      type: "select",
      required: false,
      options: [
        { value: "pending", label: "Pending" },
        { value: "authorized", label: "Authorized" },
        { value: "paid", label: "Paid" },
        { value: "partially_paid", label: "Partially paid" },
        { value: "refunded", label: "Refunded" },
        { value: "voided", label: "Voided" },
      ],
    },
    {
      name: "note",
      label: "Order Note",
      description: "Optional internal note stored on the order.",
      type: "textarea",
      required: false,
    },
    {
      name: "tags",
      label: "Tags",
      description: "Optional comma-separated tags applied to the order.",
      type: "text",
      required: false,
      placeholder: "vip, wholesale",
    },
    {
      name: "shipping_address",
      sensitivity: "recipient",
      label: "Shipping address",
      description:
        'Developer option. The shipping address as a JSON object with any of `address1`, `address2`, `city`, `province`, `country_code` (two-letter code like "US"), `zip`. Enter the JSON value or insert a value from a previous step.',
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
      placeholder:
        '{"address1":"1 Main St","city":"Denver","province":"CO","country_code":"US","zip":"80202"}',
    },
    {
      name: "billing_address",
      sensitivity: "recipient",
      label: "Billing address",
      description:
        "Developer option. Same shape as Shipping address, as a JSON object. Enter the JSON value or insert a value from a previous step.",
      type: "json",
      required: false,
      advanced: true,
      jsonShape: "object",
    },
  ],
  outputs: [
    { name: "orderId", type: "string", description: "Shopify order id." },
    { name: "orderNumber", type: "number", description: "Customer-facing order number. Null when Shopify omits it." },
    { name: "orderName", type: "string", description: "Order name (e.g. `#1001`). Null when omitted." },
    {
      name: "email",
      type: "string",
      description: "Customer email Shopify stored (echo).",
      sensitive: true,
    },
    { name: "totalPrice", type: "string", description: "Order total as a decimal string." },
    { name: "currency", type: "string", description: "ISO currency code of the order." },
    { name: "financialStatus", type: "string", description: "Shopify financial status after creation." },
    { name: "fulfillmentStatus", type: "string", description: "Shopify fulfillment status after creation. Null when unfulfilled." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the order." },
    { name: "createdAt", type: "string", description: "ISO timestamp Shopify created the order." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 10,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Creates a real order on the store; may email the customer when Send Receipt is on. Recoverable (orders can be cancelled), but persists in Shopify.",
};
