import { z } from "zod";

/**
 * Config schema for `quickbooks:send_invoice` — QUICKBOOKS-1.
 *
 * `sendTo` optional: when set it overrides AND persists the invoice's
 * billing email (Intuit-documented behavior); when empty QuickBooks
 * sends to the invoice's stored billing email (a missing one fails the
 * run with QuickBooks' own error — V2 never invents a recipient).
 */
export const SendInvoiceConfigSchema = z
  .object({
    invoiceId: z.string().min(1).max(64),
    sendTo: z.string().max(320).optional(),
  })
  .strict();
export type SendInvoiceConfig = z.infer<typeof SendInvoiceConfigSchema>;
