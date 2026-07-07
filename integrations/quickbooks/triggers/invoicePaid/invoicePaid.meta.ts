import type { TriggerMeta } from "@/contracts/triggerMeta";
import {
  QUICKBOOKS_INVOICE_PAYLOAD,
  quickbooksEventPrefix,
} from "../_shared/payloadShapes";

/**
 * Builder-facing metadata for `quickbooks:invoice_paid` — QUICKBOOKS-1.
 *
 * DERIVED trigger — QuickBooks has no native invoice-paid event. V2
 * derives it from Payment Create/Update events: fetch the payment, walk
 * its linked invoices, re-fetch each, and fire ONLY for invoices whose
 * balance is verifiably zero (with a positive total). Dedup is by
 * durable invoice identity (`invoice_paid:{realmId}:{invoiceId}`), so
 * Payment Create + Update for the same payment — or two partial
 * payments finishing the same invoice — collapse to ONE fire, and the
 * trigger never fires before payment is confirmed (a partial payment
 * leaves balance > 0 → no fire).
 */
export const quickbooksInvoicePaidTriggerMeta: TriggerMeta = {
  key: "quickbooks:invoice_paid",
  provider: "quickbooks",
  type: "invoice_paid",
  displayName: "Invoice Paid",
  description:
    "Fires when an invoice in the connected QuickBooks company becomes fully paid (balance reaches zero). Derived from payment events with the invoice balance re-checked before firing — partial payments do not fire. Fires once per invoice.",
  category: "commerce",
  activation: "webhook",
  requiresIntegration: true,
  fields: [],
  payloadShape: [
    ...quickbooksEventPrefix("invoice_paid"),
    {
      name: "paymentId",
      type: "string",
      description:
        "Id of the payment whose event completed the invoice (the last one, when several contributed).",
      nullable: true,
    },
    ...QUICKBOOKS_INVOICE_PAYLOAD,
  ],
  displayOrder: 40,
};
