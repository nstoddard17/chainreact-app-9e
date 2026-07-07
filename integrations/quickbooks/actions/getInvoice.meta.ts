import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_INVOICE_OUTPUTS } from "./_sharedOutputs";

/** QuickBooks `get_invoice` ActionMeta — QUICKBOOKS-1. Read-only. */
export const quickbooksGetInvoiceMeta: ActionMeta = {
  key: "quickbooks:get_invoice",
  provider: "quickbooks",
  type: "get_invoice",
  displayName: "Get Invoice",
  description:
    "Read one QuickBooks invoice by id, including its balance and paid state. Returns `found: false` when the id doesn't exist (does NOT fail the run).",
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
        "Pick an invoice, or map an id from a previous step / trigger.",
    },
  ],
  outputs: [
    {
      name: "found",
      type: "boolean",
      description:
        "True when the invoice exists. Branch on this before using `invoice`.",
    },
    {
      name: "invoice",
      type: "object",
      description:
        "The invoice (bounded projection). Null when found is false. Sensitive — customer, memos, and amounts.",
      nullable: true,
      sensitive: true,
      fields: [...QUICKBOOKS_INVOICE_OUTPUTS],
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 60,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
