import { z } from "zod";

/**
 * Config schema for `quickbooks:create_invoice` — QUICKBOOKS-1.
 *
 * Creates a DRAFT — sending is the separate `send_invoice` action.
 *
 * Line contract: every line names an existing QuickBooks item
 * (product/service) and an EXPLICIT amount — V2 never derives line
 * amounts (no hidden qty × price math; QBO requires Amount either way)
 * and never creates items. quantity / unitPrice are optional
 * pass-throughs QBO records alongside the amount.
 *
 * Tax: per-line `taxCodeId` and invoice-level `globalTaxCalculation`
 * (non-US companies) are EXPLICIT user choices only — when omitted,
 * QuickBooks' own behavior applies (US Automated Sales Tax computes tax
 * itself). V2 never guesses tax values.
 */
const InvoiceLineSchema = z
  .object({
    itemId: z.string().min(1).max(64),
    amount: z.number().finite().nonnegative(),
    quantity: z.number().finite().positive().optional(),
    unitPrice: z.number().finite().nonnegative().optional(),
    description: z.string().max(4000).optional(),
    taxCodeId: z.string().max(64).optional(),
  })
  .strict();

export const CreateInvoiceConfigSchema = z
  .object({
    customerId: z.string().min(1).max(64),
    lineItems: z.array(InvoiceLineSchema).min(1).max(100),
    txnDate: z.string().max(10).optional(),
    dueDate: z.string().max(10).optional(),
    termId: z.string().max(64).optional(),
    customerEmail: z.string().max(320).optional(),
    customerMemo: z.string().max(1000).optional(),
    privateNote: z.string().max(4000).optional(),
    globalTaxCalculation: z
      .enum(["TaxExcluded", "TaxInclusive", "NotApplicable"])
      .optional(),
  })
  .strict();
export type CreateInvoiceConfig = z.infer<typeof CreateInvoiceConfigSchema>;
