import type { ActionMeta } from "@/contracts/actionMeta";
import { QUICKBOOKS_INVOICE_OUTPUTS } from "./_sharedOutputs";

/**
 * QuickBooks `list_invoices` ActionMeta — QUICKBOOKS-1.
 *
 * One bounded page per run. No open/paid server-side filter (Balance
 * filterability in QBO's query language is unverified) — branch on each
 * item's `balance` / `paid` downstream.
 */
export const quickbooksListInvoicesMeta: ActionMeta = {
  key: "quickbooks:list_invoices",
  provider: "quickbooks",
  type: "list_invoices",
  displayName: "List Invoices",
  description:
    "List QuickBooks invoices, newest first — optionally filtered to one customer and/or an invoice-date range. Returns one bounded page per run with hasMore + nextStartPosition for paging.",
  category: "commerce",
  requiresIntegration: true,
  fields: [
    {
      name: "customerId",
      label: "Customer",
      type: "combobox",
      optionsSource: "quickbooks:customers",
      required: false,
      allowManualEntry: true,
      placeholder: "All customers",
      description: "Only invoices for this customer, when set.",
    },
    {
      name: "dateFrom",
      label: "Invoice date from",
      type: "date",
      required: false,
      description: "Inclusive lower bound on the invoice date.",
    },
    {
      name: "dateTo",
      label: "Invoice date to",
      type: "date",
      required: false,
      description: "Inclusive upper bound on the invoice date.",
    },
    {
      name: "pageSize",
      label: "Page size",
      type: "number",
      required: false,
      defaultValue: 25,
      numeric: { min: 1, max: 100, integer: true },
      placeholder: "25",
      description: "Invoices per run, 1–100. 25 matches the documented default.",
    },
    {
      name: "startPosition",
      label: "Start position",
      type: "number",
      required: false,
      advanced: true,
      numeric: { min: 1, integer: true },
      placeholder: "1",
      description:
        "1-based offset for paging — map nextStartPosition from a previous run to continue.",
    },
  ],
  outputs: [
    {
      name: "invoices",
      type: "array",
      description:
        "This page of invoices (bounded projections — same shape as Get Invoice). Sensitive — customers, memos, and amounts.",
      sensitive: true,
      fields: [...QUICKBOOKS_INVOICE_OUTPUTS],
    },
    {
      name: "count",
      type: "number",
      description: "Number of invoices in this page.",
    },
    {
      name: "hasMore",
      type: "boolean",
      description:
        "True when the page came back full — more invoices may exist.",
    },
    {
      name: "nextStartPosition",
      type: "number",
      description:
        "Start position for the next page. Null when hasMore is false.",
      nullable: true,
    },
  ],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: 70,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
};
