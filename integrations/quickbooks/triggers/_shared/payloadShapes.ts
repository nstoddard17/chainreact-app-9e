import type { OutputMeta } from "@/contracts/actionMeta";
import {
  QUICKBOOKS_CUSTOMER_OUTPUTS,
  QUICKBOOKS_INVOICE_OUTPUTS,
} from "../../actions/_sharedOutputs";

/**
 * Shared payloadShape blocks for the QuickBooks trigger metas —
 * QUICKBOOKS-1.
 *
 * Trigger payloads are the SAME bounded projections the read actions
 * return (one entity shape everywhere), flattened to the payload top
 * level, plus the routing fields every QuickBooks event carries:
 * `changeKind` and `realmId`. Mirrors
 * `integrations/quickbooks/webhooks/normalize.ts` exactly.
 */

export function quickbooksEventPrefix(changeKind: string): OutputMeta[] {
  return [
    {
      name: "changeKind",
      type: "string",
      description: `Always '${changeKind}'.`,
    },
    {
      name: "realmId",
      type: "string",
      description:
        "QuickBooks company id this event belongs to (one workflow watches one company).",
    },
  ];
}

/** Customer projection, flattened into the trigger payload. */
export const QUICKBOOKS_CUSTOMER_PAYLOAD: readonly OutputMeta[] = [
  ...QUICKBOOKS_CUSTOMER_OUTPUTS,
];

/** Invoice projection, flattened into the trigger payload. */
export const QUICKBOOKS_INVOICE_PAYLOAD: readonly OutputMeta[] = [
  ...QUICKBOOKS_INVOICE_OUTPUTS,
];

/** Payment projection (mirrors ProjectedQuickbooksPayment). */
export const QUICKBOOKS_PAYMENT_PAYLOAD: readonly OutputMeta[] = [
  {
    name: "paymentId",
    type: "string",
    description: "QuickBooks' id for this payment.",
    nullable: true,
  },
  {
    name: "customerId",
    type: "string",
    description: "Id of the paying customer.",
    nullable: true,
  },
  {
    name: "customerName",
    type: "string",
    description: "Name of the paying customer.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "totalAmount",
    type: "number",
    description: "Payment amount.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "unappliedAmount",
    type: "number",
    description: "Portion not yet applied to any invoice.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "currency",
    type: "string",
    description: "Payment currency code.",
    nullable: true,
  },
  {
    name: "txnDate",
    type: "string",
    description: "Payment date (YYYY-MM-DD).",
    nullable: true,
  },
  {
    name: "referenceNumber",
    type: "string",
    description: "Check / reference number on the payment.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "linkedInvoiceIds",
    type: "array",
    description: "Ids of the invoices this payment was applied to.",
  },
  {
    name: "createdAt",
    type: "string",
    description: "When the payment was recorded (ISO 8601).",
    nullable: true,
  },
  {
    name: "updatedAt",
    type: "string",
    description: "When the payment last changed (ISO 8601).",
    nullable: true,
  },
];
