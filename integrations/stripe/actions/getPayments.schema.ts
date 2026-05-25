import { z } from "zod";

/**
 * `get_payments` action schema.
 *
 * Stripe 2.1 Commit 4 — list charges (Stripe's "payments collected"
 * surface). Single-page only — V2 does NOT auto-paginate; the
 * `nextCursor` output field gives workflows the input to compose a
 * downstream pagination loop.
 *
 * Optional safe fields (parity-stripe §11 — V2 design improvement
 * over V1):
 *   - `customer`: filter to a single Stripe customer (`cus_xxx`).
 *   - `limit`: 1..100 (Stripe's documented range). Stripe defaults
 *     to 10 if omitted.
 *   - `startingAfter`: forward pagination cursor (id of the last
 *     charge from the previous page).
 *   - `endingBefore`: backward pagination cursor. Mutex with
 *     `startingAfter` — Stripe accepts both at runtime but the
 *     combo is ambiguous; V2 rejects the combination at parse time.
 *
 * Deferred (parity-stripe "if V1 supports clean behavior" gate —
 * V1's `getPayments` doesn't pass these and Stripe's API surface
 * for them on `/v1/charges` is non-trivial):
 *   - `createdGte` / `createdLte` (Stripe's `created[gte]` /
 *     `created[lte]` range filters) — V1 doesn't expose them.
 *     Future additive batch if a workflow needs time-range filtering.
 *   - `paymentIntent`, `transferGroup` — niche Stripe filters; no
 *     V1 precedent.
 *
 * V1 patterns deliberately NOT ported (parity-stripe §8):
 *   - **Endpoint:** V1 hits `/v1/payment_intents`; V2 corrects to
 *     `/v1/charges` per parity-stripe §5 M4 (matches the action's
 *     semantic — "payments collected" = charges). The next-commit
 *     `find_payment_intent` action covers PaymentIntent lookups.
 *   - **`status` client-side filter:** V1 fetched all results, then
 *     filtered by `status` in-memory because Stripe doesn't support
 *     `status` as a `payment_intents` query param. V2 rejects this
 *     pattern — workflow authors compose a downstream filter node
 *     if status filtering is needed. The runs-table cost of fetching
 *     unfiltered data and discarding is too high to bury inside the
 *     action.
 *   - **`limit || 100` hidden default + `Math.min(limit, 100)`
 *     silent clamping:** V2 schema validates `1..100` and rejects
 *     out-of-range at parse time. No silent coercion.
 *   - **Auto-pagination / `fetchAll` mode:** V1 doesn't have it;
 *     V2 doesn't either. Schema rejects the field.
 *   - **Raw `expand` passthrough:** V1 doesn't have it; V2 rejects.
 */
export const GetPaymentsConfigSchema = z
  .object({
    customer: z.string().min(1).optional(),
    limit: z
      .number()
      .int("limit must be an integer")
      .min(1, "limit must be at least 1")
      .max(100, "limit cannot exceed 100 (Stripe API maximum)")
      .optional(),
    startingAfter: z.string().min(1).optional(),
    endingBefore: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startingAfter !== undefined &&
      value.endingBefore !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endingBefore"],
        message:
          "endingBefore must be omitted when startingAfter is supplied (cursor direction is mutually exclusive)",
      });
    }
  });

export type GetPaymentsConfig = z.infer<typeof GetPaymentsConfigSchema>;
