import { z } from "zod";

/**
 * `update_order_status` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/updateOrderStatus.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/updateOrderStatus.ts).
 *
 * Three sub-actions in Slice 12 Batch 1: `cancel`, `add_tags`,
 * `add_note`. **`fulfill` is NOT in this enum** — fulfillment goes
 * through the dedicated `create_fulfillment` action because the REST
 * fulfillment-order flow needs its own rich field set (tracking
 * info, fulfillment-order discovery). This is a deliberate split per
 * Slice 12 plan §"In-scope action list".
 *
 * Q11 — `notify_customer` REQUIRED at the schema layer. Even though
 * Shopify's `PUT /orders/{id}.json` (the wire shape used for tags /
 * note) doesn't actually email the customer, V1 keeps the gate
 * required for shape consistency across all sub-actions. The cancel
 * sub-action DOES email the customer when notify_customer=true (maps
 * to Shopify's `email` body field).
 *
 * Discriminated union via `z.discriminatedUnion` so TS narrows
 * `tags` / `note` requirements based on the action.
 */

const Cancel = z
  .object({
    action: z.literal("cancel"),
    order_id: z.union([z.string().min(1), z.number().int().positive()]),
    notify_customer: z.boolean(),
    reason: z.enum(["customer", "fraud", "inventory", "declined", "other"]).optional(),
    restock: z.boolean().optional(),
  })
  .strict();

const AddTags = z
  .object({
    action: z.literal("add_tags"),
    order_id: z.union([z.string().min(1), z.number().int().positive()]),
    notify_customer: z.boolean(),
    /** Comma-separated. Merged with existing tags by the handler. */
    tags: z.string().min(1),
  })
  .strict();

const AddNote = z
  .object({
    action: z.literal("add_note"),
    order_id: z.union([z.string().min(1), z.number().int().positive()]),
    notify_customer: z.boolean(),
    note: z.string().min(1),
  })
  .strict();

export const UpdateOrderStatusConfigSchema = z.discriminatedUnion("action", [
  Cancel,
  AddTags,
  AddNote,
]);

export type UpdateOrderStatusConfig = z.infer<
  typeof UpdateOrderStatusConfigSchema
>;
