import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Builder-facing metadata for `stripe:find_subscription`.
 *
 * **Read-only.** Direct id lookup via `GET /v1/subscriptions/{id}`.
 * 404 → `{found: false, subscription: null}` (NOT thrown).
 *
 * Mirrors `findSubscription.schema.ts` — single required field. No
 * email / customer fallback (parity with V1's direct-lookup surface).
 *
 * Outputs match `findSubscription.ts:return` — bounded 14-key
 * subscription projection (no raw spread, no card/payment-method
 * leakage).
 */
export const stripeFindSubscriptionMeta: ActionMeta = {
  key: "stripe:find_subscription",
  provider: "stripe",
  type: "find_subscription",
  displayName: "Find Subscription",
  description:
    "Look up a Stripe subscription by id. Read-only — no money moves. Returns `found: false` on 404 (does NOT throw). Useful for branching on subscription state after a webhook event or for chained workflows that need current billing state.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "subscriptionId",
      label: "Subscription",
      description:
        "Which subscription to look up. Pick one, paste a sub_ id, or insert one from an earlier step.",
      type: "combobox",
      required: true,
      placeholder: "sub_xxx",
      optionsSource: "stripe:subscriptions",
      allowManualEntry: true,
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when Stripe returned the subscription; false when the lookup 404'd.",
    },
    {
      name: "subscription",
      type: "object",
      description:
        "Bounded subscription projection when `found: true` (`{subscriptionId, customerId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt, trialStart, trialEnd, collectionMethod, currency, latestInvoiceId, metadata, livemode}`); null when `found: false`. Period / trial / canceled timestamps are raw Unix seconds. Drill via `{{nodeId.subscription.<field>}}`. Marked sensitive — carries `customerId`, `latestInvoiceId`, and `metadata` (arbitrary workflow-defined keys often containing customer references); parity with `findCustomer.customer` (which is also sensitive); redacts from the run-detail API and variable picker preview.",
      sensitive: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 120,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
