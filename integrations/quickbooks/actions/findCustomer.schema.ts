import { z } from "zod";

/**
 * Config schema for `quickbooks:find_customer` — QUICKBOOKS-1.
 *
 * ONE search field per run — QuickBooks' query language has no OR, so a
 * multi-field search would be dishonest (it could only AND). `searchBy`
 * picks the column; `value` is the exact-match term (escaped
 * server-side; user input never reaches the query statement raw).
 */
export const FindCustomerConfigSchema = z
  .object({
    searchBy: z.enum(["email", "displayName", "companyName"]),
    value: z.string().min(1).max(500),
  })
  .strict();
export type FindCustomerConfig = z.infer<typeof FindCustomerConfigSchema>;
