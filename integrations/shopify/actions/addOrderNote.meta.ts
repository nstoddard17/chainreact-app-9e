import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:add_order_note` — Slice 4.SHOPIFY-META-2.
 * Mirrors `addOrderNote.schema.ts`. No Q11 gate (note updates don't email
 * the customer). `append` chooses append-vs-overwrite (required, no default —
 * the behaviors differ meaningfully).
 */
export const shopifyAddOrderNoteMeta: ActionMeta = {
  key: "shopify:add_order_note",
  provider: "shopify",
  type: "add_order_note",
  displayName: "Add Order Note",
  description:
    "Set or append the internal note on a Shopify order. Notes are internal-only and never emailed to the customer.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "order_id",
      label: "Order ID",
      description: "The Shopify order id to add the note to.",
      type: "text",
      required: true,
      placeholder: "450789469",
    },
    {
      name: "note",
      label: "Note",
      description: "The note text.",
      type: "textarea",
      required: true,
    },
    {
      name: "append",
      label: "Append to Existing Note",
      description:
        "Required, no default. When true, the note is appended on a new paragraph to the order's existing note; when false, it overwrites.",
      type: "boolean",
      required: true,
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the note was saved." },
    { name: "orderId", type: "string", description: "The Shopify order id." },
    { name: "note", type: "string", description: "The resulting note value stored on the order." },
    { name: "updatedAt", type: "string", description: "ISO timestamp of the update." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 30,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription: "Edits an order's internal note — recoverable external write.",
};
