import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  QUICKBOOKS_INVOICE_PAYLOAD,
  quickbooksEventPrefix,
} from "../_shared/payloadShapes";

/**
 * Builder-facing metadata for `quickbooks:invoice_created` —
 * QUICKBOOKS-1. App-level webhook; Invoice+Create events after
 * post-fetch enrichment.
 */
export const quickbooksInvoiceCreatedTriggerMeta: TriggerMeta = {
  key: "quickbooks:invoice_created",
  provider: "quickbooks",
  type: "invoice_created",
  displayName: "Invoice Created",
  description:
    "Fires when an invoice is created in the connected QuickBooks company — whether by a workflow, the QuickBooks UI, or another app. Carries the full invoice with lines, totals, and balance.",
  category: "commerce",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...quickbooksEventPrefix("invoice_created"),
    ...QUICKBOOKS_INVOICE_PAYLOAD,
  ],
  displayOrder: 20,
};
