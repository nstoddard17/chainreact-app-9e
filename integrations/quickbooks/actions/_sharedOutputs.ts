import type { OutputMeta } from "@/contracts/actionMeta";

/**
 * Shared OutputMeta blocks for the QuickBooks action metas —
 * QUICKBOOKS-1. One definition per projected entity so the seven action
 * metas (and their variable-picker shapes) can't drift from each other
 * or from `integrations/_shared/quickbooks/projections.ts`.
 *
 * Sensitivity posture (accounting data is high-sensitivity): customer
 * names / emails / phones / addresses / notes, invoice memos / line
 * descriptions, and ALL money fields (amounts / balances) are marked
 * `sensitive: true` — redacted in run details + variable-picker previews
 * while still flowing into downstream nodes (Slice 3.SEC-7 semantics).
 */

/** Bounded customer projection (mirrors ProjectedQuickbooksCustomer). */
export const QUICKBOOKS_CUSTOMER_OUTPUTS: readonly OutputMeta[] = [
  {
    name: "customerId",
    type: "string",
    description: "QuickBooks' id for this customer.",
    nullable: true,
  },
  {
    name: "displayName",
    type: "string",
    description: "Customer display name (unique across QuickBooks names).",
    nullable: true,
    sensitive: true,
  },
  {
    name: "companyName",
    type: "string",
    description: "Company name on the customer record.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "givenName",
    type: "string",
    description: "First name.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "familyName",
    type: "string",
    description: "Last name.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "email",
    type: "string",
    description: "Primary email on the customer record.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "phone",
    type: "string",
    description: "Primary phone on the customer record.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "billingAddress",
    type: "object",
    description:
      "Billing address: line1, line2, city, state, postalCode, country.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "notes",
    type: "string",
    description: "Notes on the customer record.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "active",
    type: "boolean",
    description: "Whether the customer is active in QuickBooks.",
  },
  {
    name: "balance",
    type: "number",
    description: "Open balance the customer owes.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "currency",
    type: "string",
    description: "Customer currency code.",
    nullable: true,
  },
  {
    name: "createdAt",
    type: "string",
    description: "When the record was created (ISO 8601).",
    nullable: true,
  },
  {
    name: "updatedAt",
    type: "string",
    description: "When the record last changed (ISO 8601).",
    nullable: true,
  },
];

/** Bounded invoice projection (mirrors ProjectedQuickbooksInvoice). */
export const QUICKBOOKS_INVOICE_OUTPUTS: readonly OutputMeta[] = [
  {
    name: "invoiceId",
    type: "string",
    description: "QuickBooks' id for this invoice.",
    nullable: true,
  },
  {
    name: "docNumber",
    type: "string",
    description: "Invoice number shown to the customer.",
    nullable: true,
  },
  {
    name: "customerId",
    type: "string",
    description: "Id of the invoiced customer.",
    nullable: true,
  },
  {
    name: "customerName",
    type: "string",
    description: "Name of the invoiced customer.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "txnDate",
    type: "string",
    description: "Invoice date (YYYY-MM-DD).",
    nullable: true,
  },
  {
    name: "dueDate",
    type: "string",
    description: "Due date (YYYY-MM-DD).",
    nullable: true,
  },
  {
    name: "totalAmount",
    type: "number",
    description: "Invoice total.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "balance",
    type: "number",
    description: "Unpaid remainder. 0 means fully paid.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "paid",
    type: "boolean",
    description:
      "True exactly when the invoice has a positive total and zero balance.",
  },
  {
    name: "emailStatus",
    type: "string",
    description:
      "QuickBooks email status (e.g. NotSet, NeedToSend, EmailSent).",
    nullable: true,
  },
  {
    name: "billEmail",
    type: "string",
    description: "Email address the invoice is billed/sent to.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "currency",
    type: "string",
    description: "Invoice currency code.",
    nullable: true,
  },
  {
    name: "customerMemo",
    type: "string",
    description: "Customer-visible memo printed on the invoice.",
    nullable: true,
    sensitive: true,
  },
  {
    name: "privateNote",
    type: "string",
    description: "Internal note (never shown to the customer).",
    nullable: true,
    sensitive: true,
  },
  {
    name: "lines",
    type: "array",
    description:
      "Sales lines: lineId, description, amount, quantity, unitPrice, itemId, itemName. Sensitive — descriptions and amounts.",
    sensitive: true,
  },
  {
    name: "createdAt",
    type: "string",
    description: "When the invoice was created (ISO 8601).",
    nullable: true,
  },
  {
    name: "updatedAt",
    type: "string",
    description: "When the invoice last changed (ISO 8601).",
    nullable: true,
  },
];
