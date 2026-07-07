import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  QUICKBOOKS_PAYMENT_PAYLOAD,
  quickbooksEventPrefix,
} from "../_shared/payloadShapes";

/**
 * Builder-facing metadata for `quickbooks:payment_received` —
 * QUICKBOOKS-1. App-level webhook; Payment+Create events after
 * post-fetch enrichment. Fires once per recorded payment (Payment
 * Update events do NOT re-fire this trigger — they only feed the
 * separate Invoice Paid derivation).
 */
export const quickbooksPaymentReceivedTriggerMeta: TriggerMeta = {
  key: "quickbooks:payment_received",
  provider: "quickbooks",
  type: "payment_received",
  displayName: "Payment Received",
  description:
    "Fires when a payment is recorded in the connected QuickBooks company. Carries the payment amount, customer, and the ids of any invoices it was applied to.",
  category: "commerce",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...quickbooksEventPrefix("payment_received"),
    ...QUICKBOOKS_PAYMENT_PAYLOAD,
  ],
  displayOrder: 30,
};
