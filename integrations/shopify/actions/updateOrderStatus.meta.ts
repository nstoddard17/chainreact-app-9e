import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `shopify:update_order_status` — Slice 4.SHOPIFY-META-2.
 *
 * Mirrors `updateOrderStatus.schema.ts`, a `z.discriminatedUnion("action", …)`
 * over three operations: `cancel`, `add_tags`, `add_note`. The union is
 * flattened into a single field set:
 *   - `action` / `order_id` / `notify_customer` are common (required).
 *   - `reason` / `restock` (cancel-only) and `tags` (add_tags) / `note`
 *     (add_note) carry `dependsOn: "action"` so the builder clears them when
 *     the operation changes. They are `required: false` at the meta layer
 *     because their requiredness is operation-conditional; the runtime
 *     discriminated union is authoritative.
 *
 * RISK (Marcus decision, 4.SHOPIFY-META-2): the `cancel` operation cancels
 * the order and (when notify_customer) emails the customer — irreversible
 * from the workflow's perspective. ActionMeta risk is ACTION-level only
 * (no per-operation risk in the contract), so the WHOLE action is marked
 * high + destructive + requiresConfirmation.
 *
 * TODO (follow-up): when the contract gains operation/field-level risk,
 * scope confirmation to `action === "cancel"` and let add_tags / add_note
 * drop back to medium with no confirmation.
 */
export const shopifyUpdateOrderStatusMeta: ActionMeta = {
  key: "shopify:update_order_status",
  provider: "shopify",
  type: "update_order_status",
  displayName: "Update Order Status",
  description:
    "Update an existing order. Pick an operation: Cancel (cancels the order; optionally restock + email the customer), Add Tags (merge comma-separated tags), or Add Note (set the order note). Cancel is irreversible — this action requires confirmation before it runs.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "action",
      label: "Operation",
      description:
        "Which order operation to perform. `cancel` is irreversible; `add_tags` / `add_note` are recoverable edits.",
      type: "select",
      required: true,
      options: [
        { value: "cancel", label: "Cancel order" },
        { value: "add_tags", label: "Add tags" },
        { value: "add_note", label: "Add / set note" },
      ],
    },
    {
      name: "order_id",
      label: "Order ID",
      description: "The Shopify order id to update.",
      type: "text",
      required: true,
      placeholder: "450789469",
    },
    {
      name: "notify_customer",
      label: "Notify Customer",
      description:
        "Required, no default (explicit consent). For Cancel, when true Shopify emails the customer a cancellation notice. Has no email effect for tags/note but is required for shape consistency.",
      type: "boolean",
      required: true,
    },
    {
      name: "reason",
      label: "Cancel Reason",
      description: "Cancel only. Why the order is being cancelled.",
      type: "select",
      required: false,
      dependsOn: "action",
      options: [
        { value: "customer", label: "Customer" },
        { value: "fraud", label: "Fraud" },
        { value: "inventory", label: "Inventory" },
        { value: "declined", label: "Declined" },
        { value: "other", label: "Other" },
      ],
    },
    {
      name: "restock",
      label: "Restock Items",
      description: "Cancel only. When true, Shopify restocks the order's items.",
      type: "boolean",
      required: false,
      dependsOn: "action",
    },
    {
      name: "tags",
      label: "Tags",
      description:
        "Add Tags only (required for that operation). Comma-separated tags; merged with the order's existing tags by the handler.",
      type: "text",
      required: false,
      dependsOn: "action",
      placeholder: "priority, gift",
    },
    {
      name: "note",
      label: "Note",
      description: "Add Note only (required for that operation). The order note text.",
      type: "textarea",
      required: false,
      dependsOn: "action",
    },
  ],
  outputs: [
    { name: "success", type: "boolean", description: "True when the update succeeded." },
    { name: "orderId", type: "string", description: "The Shopify order id that was updated." },
    { name: "orderNumber", type: "number", description: "Customer-facing order number. Null when omitted." },
    { name: "status", type: "string", description: "Resulting order status / operation result." },
    { name: "adminUrl", type: "string", description: "Shopify admin URL for the order." },
    { name: "updatedAt", type: "string", description: "ISO timestamp of the update." },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 20,
  isDestructive: true,
  requiresConfirmation: true,
  riskLevel: "high",
  riskDescription:
    "Includes a Cancel operation that cancels the order and can email the customer — irreversible from the workflow. Whole action is high-risk + confirmation-required because ActionMeta risk is action-level; future work can scope confirmation to the cancel operation only.",
};
