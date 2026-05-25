import { z } from "zod";

/**
 * `create_invoice` action schema.
 *
 * Stripe 2.1 Commit 3 — Invoice creation. Creates a draft invoice
 * for an existing Stripe customer. Finalization, line-item
 * attachment, payment, and voiding all remain deferred per
 * parity-stripe NPD-S1 (orphan-action backfill is on-demand only).
 *
 * Required fields (Q11):
 *   - `customerId`: existing Stripe customer id (`cus_xxx`). Schema
 *     enforces non-empty. V2 wire-format rename: schema `customerId`
 *     → Stripe wire `customer`.
 *
 * Optional safe fields (V1 supports — parity-stripe "if V1 supports"
 * gate):
 *   - `description`: free-text invoice description (visible to
 *     customer on the hosted invoice page).
 *   - `metadata`: `Record<string, string>` per Stripe's wire-format.
 *     No nested-JSON passthrough (V1 had it via `JSON.parse`; V2
 *     rejects).
 *   - `autoAdvance`: boolean. When `true` (Stripe's server default),
 *     Stripe automatically transitions the draft → open and attempts
 *     collection. Workflows wanting to keep the invoice in `draft`
 *     until a downstream action explicitly finalizes pass `false`.
 *
 * Deferred (V1 doesn't support these on `createInvoice` — per
 * parity-stripe "if V1 supports" gate, V2 also omits — additive
 * future batch if a workflow needs them):
 *   - `collectionMethod` (`charge_automatically` vs `send_invoice`)
 *     — Stripe defaults to `charge_automatically` if customer has a
 *     default payment method.
 *   - `daysUntilDue` — Stripe requires `collectionMethod:
 *     "send_invoice"` for this to apply; coupled to the above
 *     deferral.
 *   - `dueDate` — same coupling.
 *   - `footer` — invoice footer text. Low-value standalone.
 *   - `subscription` — attach the invoice to an existing subscription
 *     (out-of-cycle billing pattern). Niche workflow.
 *   - `automatic_tax` — V1's create_invoice does not pass it (gap
 *     identical to `create_payment_link`).
 *   - `application_fee_amount`, `application_fee_percent`, `transfer_data`
 *     — Stripe Connect platform-fee surface; no V2 convention yet
 *     (same deferral as `create_payment_link`).
 *
 * V1 patterns deliberately NOT ported (parity-stripe §8):
 *   - Raw `metadata` JSON-string passthrough (V1 parsed
 *     `JSON.parse(metadata)`).
 *   - `success: false` synthetic error envelope (V1 caught all
 *     errors and stuffed them into ActionResult). V2 lets errors
 *     propagate to the engine.
 *   - `dueDate` echoed back as ISO-8601 even though V1 didn't accept
 *     it as input (V1's output mapping had it; V2 doesn't echo it
 *     because the input doesn't take it).
 *
 * Side effects (Q8d testMode semantics):
 *   - Creating an invoice DOES NOT charge the customer immediately —
 *     `auto_advance: true` triggers Stripe's own queued collection,
 *     which is asynchronous and observable via `invoice.paid` /
 *     `invoice.payment_failed` webhook events. The
 *     `Idempotency-Key` header still guards against engine-level
 *     duplicate creates.
 */
export const CreateInvoiceConfigSchema = z
  .object({
    customerId: z.string().min(1, "customerId is required"),
    description: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    autoAdvance: z.boolean().optional(),
  })
  .strict();

export type CreateInvoiceConfig = z.infer<typeof CreateInvoiceConfigSchema>;
