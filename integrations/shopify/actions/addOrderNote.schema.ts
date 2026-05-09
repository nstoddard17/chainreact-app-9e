import { z } from "zod";

/**
 * `add_order_note` action schema (Slice 12 Commit 3).
 *
 * V1 reference: [`lib/workflows/actions/shopify/addOrderNote.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/shopify/addOrderNote.ts).
 *
 * Two modes via the `append` boolean:
 *   - `append: true`  — fetch existing note, append on a new
 *     paragraph, PUT.
 *   - `append: false` — overwrite the existing note. Single PUT,
 *     no auxiliary GET.
 *
 * No Q11 gate — `PUT /orders/{id}.json` for note updates does NOT
 * trigger any customer-facing email. Notes are internal.
 */
export const AddOrderNoteConfigSchema = z
  .object({
    order_id: z.union([z.string().min(1), z.number().int().positive()]),
    note: z.string().min(1),
    /**
     * Required-no-default — V1 defaulted to `true` ([V1 shopify/index.ts:1798](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/shopify/index.ts#L1798)).
     * The behavior difference is meaningful (append vs replace), so
     * Slice 12 makes the workflow author choose explicitly.
     */
    append: z.boolean(),
  })
  .strict();

export type AddOrderNoteConfig = z.infer<typeof AddOrderNoteConfigSchema>;
