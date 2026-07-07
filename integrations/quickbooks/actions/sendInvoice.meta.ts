import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_INVOICE_OUTPUTS } from "./_sharedOutputs";

/**
 * QuickBooks `send_invoice` ActionMeta — QUICKBOOKS-1.
 *
 * CUSTOMER-FACING email send — deliberately separate from
 * create_invoice. `sendTo` is annotated `sensitivity: "recipient"`
 * (apply-safety blocks silent auto-writes to it).
 */
export const quickbooksSendInvoiceMeta: ActionMeta = {
  key: "quickbooks:send_invoice",
  provider: "quickbooks",
  type: "send_invoice",
  displayName: "Send Invoice (emails customer)",
  description:
    "Email an existing QuickBooks invoice to the customer. This is customer-facing: QuickBooks delivers the invoice email immediately. Sends to the invoice's billing email unless a Send to override is given.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "invoiceId",
      label: "Invoice",
      type: "combobox",
      optionsSource: "quickbooks:invoices",
      required: true,
      allowManualEntry: true,
      placeholder: "Search recent invoices…",
      description:
        "Pick an invoice, or map the invoiceId from Create Invoice.",
    },
    {
      name: "sendTo",
      label: "Send to (override)",
      type: "text",
      required: false,
      sensitivity: "recipient",
      placeholder: "Invoice's billing email",
      description:
        "Optional email override. Also updates the invoice's stored billing email in QuickBooks. Leave empty to use the invoice's billing email — QuickBooks fails the send if none is set.",
    },
  ],
  outputs: [...QUICKBOOKS_INVOICE_OUTPUTS],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 50,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "medium",
  riskDescription:
    "Emails the invoice to the customer immediately — an outward-facing send.",
};
