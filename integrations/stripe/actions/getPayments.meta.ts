import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:get_payments`.
 *
 * **Read-only.** Lists Stripe charges (the "payments collected"
 * surface) via `GET /v1/charges`. Single-page only — V2 does NOT
 * auto-paginate. Workflows page by re-calling the action with
 * `startingAfter: {{prev.nextCursor}}`.
 *
 * Mirrors `getPayments.schema.ts`:
 *   - `customer`      (optional) — filter to a single Stripe customer.
 *   - `limit`         (optional 1..100) — page size. No default
 *                      applied here; Stripe defaults to 10 when
 *                      omitted.
 *   - `startingAfter` (optional) — forward pagination cursor (id of
 *                      the last charge from the previous page).
 *   - `endingBefore`  (optional) — backward pagination cursor. Mutex
 *                      with `startingAfter` — runtime schema rejects
 *                      the combination.
 *
 * Outputs match `getPayments.ts:return` — bounded 13-key projection
 * per charge. No card / payment-method / receipt-number leakage
 * beyond the documented `receiptUrl` (which is a customer-facing
 * Stripe-hosted URL, safe to expose).
 */
export const stripeGetPaymentsMeta: ActionMeta = {
  key: "stripe:get_payments",
  provider: "stripe",
  type: "get_payments",
  displayName: "Get Payments",
  description:
    "List Stripe charges (the 'payments collected' surface). Read-only — no money moves. Single-page only — call again with `startingAfter: {{prev.nextCursor}}` to page forward. **Mutex invariant:** pass EITHER `startingAfter` OR `endingBefore`, not both (runtime schema rejects the combination).",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customer",
      label: "Customer ID",
      description:
        "Optional — filter results to a single Stripe customer (`cus_xxx`). Omit to list all charges on the connected account.",
      type: "text",
      required: false,
      placeholder: "cus_xxx",
    },
    {
      name: "limit",
      label: "Limit",
      description:
        "Optional page size, 1..100 (Stripe's documented maximum). **No default applied here** — Stripe defaults to 10 when omitted.",
      type: "number",
      required: false,
      numeric: { min: 1, max: 100, integer: true, step: 1 },
      placeholder: "10",
    },
    {
      name: "startingAfter",
      label: "Starting after (cursor)",
      description:
        "Optional forward pagination cursor — the id of the last charge from the previous page (typically wired from `{{prev.nextCursor}}`). Stripe pagination uses last-result IDs as cursors, not page numbers. **Mutex with Ending before.**",
      type: "text",
      required: false,
      placeholder: "ch_xxx",
    },
    {
      name: "endingBefore",
      label: "Ending before (cursor)",
      description:
        "Optional backward pagination cursor — the id of the first charge on the next-newer page. Use to walk backwards through results. **Mutex with Starting after.** Stripe pagination uses charge IDs as cursors, not page numbers.",
      type: "text",
      required: false,
      placeholder: "ch_xxx",
    },
  ],
  outputs: [
    {
      name: "payments",
      type: "array",
      description:
        "Array of bounded charge projections. Each entry: `{chargeId, amount, currency, status, paid, refunded, customerId, paymentIntentId, created, description, receiptUrl, metadata, livemode}`. Amounts are in CENTS (Stripe wire-format). Drill via `{{nodeId.payments[0].chargeId}}`.",
    },
    {
      name: "count",
      type: "number",
      description:
        "Number of charges returned in this page — equals `payments.length`. NOT the total across all pages.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description:
        "True when more pages exist after this one (Stripe's `has_more` echo). When true, call again with `startingAfter: {{prev.nextCursor}}`.",
    },
    {
      name: "nextCursor",
      type: "string",
      description:
        "Id of the last charge in this page when `hasMore: true`; null otherwise. Pass as `startingAfter` on the next iteration to fetch the next page.",
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 160,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
