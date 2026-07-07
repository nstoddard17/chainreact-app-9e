import { z } from "zod";

/** Config schema for `quickbooks:get_invoice` — QUICKBOOKS-1. */
export const GetInvoiceConfigSchema = z
  .object({
    invoiceId: z.string().min(1).max(64),
  })
  .strict();
export type GetInvoiceConfig = z.infer<typeof GetInvoiceConfigSchema>;
