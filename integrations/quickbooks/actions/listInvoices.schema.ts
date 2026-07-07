import { z } from "zod";

/**
 * Config schema for `quickbooks:list_invoices` — QUICKBOOKS-1.
 *
 * Safe fixed filters only (customer + date range) — NO generic query
 * input. No open/paid server-side filter: `Balance` filterability in
 * QBO's query language is unverified (research §Unverified 7); callers
 * branch on each item's projected `balance` / `paid`. Pagination is
 * QBO's offset model: `startPosition` (1-based) + `pageSize`.
 */
export const ListInvoicesConfigSchema = z
  .object({
    customerId: z.string().max(64).optional(),
    dateFrom: z.string().max(10).optional(),
    dateTo: z.string().max(10).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
    startPosition: z.number().int().min(1).optional(),
  })
  .strict();
export type ListInvoicesConfig = z.infer<typeof ListInvoicesConfigSchema>;
