import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:create_fulfillment` — Slice 4.SHOPIFY-META-2.
 * Mirrors `createFulfillment.schema.ts`. `notify_customer` is an explicit
 * consent gate (Q11) — when true Shopify emails a shipping confirmation.
 * Tracking fields are optional; Shopify groups them into one tracking_info
 * object on the wire when any is set.
 */
export const shopifyCreateFulfillmentMeta: ActionMeta = {
  key: "shopify:create_fulfillment",
  provider: "shopify",
  type: "create_fulfillment",
  displayName: "Create Fulfillment",
  description:
    "Fulfill an order's open fulfillment-order line items. When `notify_customer` is true, Shopify emails the customer a shipping confirmation. Optional tracking number / company / URL are attached when provided.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "order_id",
      label: "Order",
      description:
        "Which order to fulfill. Pick one of your store's recent orders, map an order id from an earlier step, or type a Shopify order id.",
      type: "combobox",
      optionsSource: "shopify:orders",
      allowManualEntry: true,
      required: true,
      placeholder: "Search orders or type an id",
    },
    {
      name: "notify_customer",
      label: "Notify Customer",
      description:
        "Required, no default (explicit consent). When true, Shopify emails the customer a shipping confirmation.",
      type: "boolean",
      required: true,
    },
    {
      name: "tracking_number",
      label: "Tracking Number",
      description: "Optional carrier tracking number.",
      type: "text",
      required: false,
    },
    {
      name: "tracking_company",
      label: "Tracking Company",
      description: "Optional carrier name (e.g. UPS, FedEx).",
      type: "text",
      required: false,
    },
    {
      name: "tracking_url",
      label: "Tracking URL",
      description: "Optional tracking URL (must be a valid URL).",
      type: "text",
      required: false,
      placeholder: "https://tools.usps.com/go/TrackConfirmAction?tLabels=...",
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the fulfillment was created." },
    { name: "fulfillmentId", type: "string", description: "Shopify fulfillment id." },
    { name: "orderId", type: "string", description: "The fulfilled order id." },
    { name: "status", type: "string", description: "Fulfillment status." },
    { name: "trackingNumber", type: "string", description: "Tracking number stored. Null when not supplied." },
    { name: "trackingUrl", type: "string", description: "Tracking URL stored. Null when not supplied." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the order." },
    { name: "createdAt", type: "string", description: "ISO timestamp the fulfillment was created." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 40,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Marks items shipped and may email the customer. Hard to undo cleanly but not money-moving; treated as medium.",
};
